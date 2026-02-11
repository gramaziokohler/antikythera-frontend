import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import { useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { convertCompasDataToThree } from '../../utils/compas-converter';

interface GeometryViewerProps {
    data: any; // { type: 'geometry', value: { dtype, data }, key: string, blueprintId: string }
}

function SceneContent({ object, uniqueId }: { object: THREE.Object3D | null, uniqueId: string }) {
    const { camera, controls } = useThree();
    const zoomedId = useRef<string | null>(null);

    useEffect(() => {
        if (object && uniqueId !== zoomedId.current) {
            // Calculate bounding box to get the SIZE of the object
            // Note: Since we use <Center> component, the object will be visually centered at (0,0,0)
            // so we don't care about the object's actual center position for camera targeting,
            // only its dimensions for zoom level.
            const box = new THREE.Box3().setFromObject(object);

            if (box.isEmpty()) return;

            const size = box.getSize(new THREE.Vector3());

            // Calculate distance to fit object in view based on size
            const maxDim = Math.max(size.x, size.y, size.z);
            const effectiveDim = maxDim > 0 ? maxDim : 1;

            const fov = 50;
            const distance = (effectiveDim / 2) / Math.tan((fov / 2) * (Math.PI / 180)) * 2.0;

            // Position camera looking at origin (0,0,0) where <Center> puts the object
            camera.position.set(distance, distance, distance);

            camera.near = effectiveDim / 1000;
            camera.far = effectiveDim * 100;
            camera.updateProjectionMatrix();

            camera.lookAt(0, 0, 0);

            if (controls && 'target' in controls) {
                (controls as any).target.set(0, 0, 0);
                (controls as any).update();
            }

            zoomedId.current = uniqueId;
        }
    }, [object, uniqueId, camera, controls]);

    if (!object) return null;

    return (
        <primitive object={object} />
    );
}

export function GeometryViewer({ data }: GeometryViewerProps) {
    const [threeObject, setThreeObject] = useState<THREE.Object3D | null>(null);
    const uniqueId = data ? `${data.blueprintId}:${data.key}` : '';

    useEffect(() => {
        if (data && data.value) {
            const obj = convertCompasDataToThree(data.value);
            setThreeObject(obj);
        } else {
            setThreeObject(null);
        }
    }, [data]);

    return (
        <div className="geometry-viewer-container">
            <div className="viewer-toolbar">
                {/* Could add reset camera button here */}
            </div>
            <Canvas camera={{ position: [5, 5, 5], fov: 50 }} shadows>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
                <directionalLight position={[-10, -10, -5]} intensity={0.5} />

                <group>
                    <Grid position={[0, -0.01, 0]} args={[100, 100]} cellColor="#6f6f6f" sectionColor="#9d4b4b" fadeDistance={200} infiniteGrid />
                    <Center>
                        <SceneContent object={threeObject} uniqueId={uniqueId} />
                    </Center>
                </group>

                <OrbitControls makeDefault />
            </Canvas>
        </div>
    );
}
