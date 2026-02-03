import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { convertCompasDataToThree } from '../../utils/compas-converter';

interface GeometryViewerProps {
    data: any; // { type: 'geometry', value: { dtype, data } }
}

function SceneContent({ object }: { object: THREE.Object3D | null }) {
    const { camera, controls } = useThree();

    useEffect(() => {
        if (object) {
            // Calculate bounding box
            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            // Calculate distance to fit object in view
            // Use the largest dimension to determine camera distance
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = 50; // Camera FOV
            const distance = (maxDim / 2) / Math.tan((fov / 2) * (Math.PI / 180)) * 1.5; // 1.5x for padding
            
            // Position camera at isometric angle
            camera.position.set(
                center.x + distance,
                center.y + distance,
                center.z + distance
            );
            
            camera.lookAt(center);
            
            // Update orbit controls target to center
            if (controls && 'target' in controls) {
                (controls as any).target.copy(center);
                (controls as any).update();
            }
        }
    }, [object, camera, controls]);

    if (!object) return null;

    return (
        <>
            <primitive object={object} />
        </>
    );
}

export function GeometryViewer({ data }: GeometryViewerProps) {
    const [threeObject, setThreeObject] = useState<THREE.Object3D | null>(null);

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
                    <Grid position={[0, -0.01, 0]} args={[10, 10]} cellColor="#6f6f6f" sectionColor="#9d4b4b" fadeDistance={20} />
                    <Center top>
                        <SceneContent object={threeObject} />
                    </Center>
                </group>

                <OrbitControls makeDefault />
            </Canvas>
        </div>
    );
}
