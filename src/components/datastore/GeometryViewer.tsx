import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { convertCompasDataToThree } from '../../utils/compas-converter';

interface GeometryViewerProps {
    data: any; // { type: 'geometry', value: { dtype, data } }
}

function SceneContent({ object }: { object: THREE.Object3D | null }) {
    const { camera } = useThree();

    useEffect(() => {
        if (object) {
            // Auto-fit logic could go here
            // const box = new THREE.Box3().setFromObject(object);
            // const size = box.getSize(new THREE.Vector3());
            // const center = box.getCenter(new THREE.Vector3());
            // camera.position.set(center.x + size.x * 2, center.y + size.y * 2, center.z + size.z * 2);
            // camera.lookAt(center);
        }
    }, [object, camera]);

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
