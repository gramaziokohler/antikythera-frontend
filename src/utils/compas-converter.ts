import * as THREE from 'three';

// Basic type definitions for COMPAS data structure
interface CompasData {
    dtype: string;
    data: any;
}

export function convertCompasDataToThree(item: CompasData | any[]): THREE.Object3D | null {
    if (!item) return null;

    if (Array.isArray(item)) {
        const group = new THREE.Group();
        item.forEach(subItem => {
            const obj = convertCompasDataToThree(subItem);
            if (obj) group.add(obj);
        });
        return group.children.length > 0 ? group : null;
    }

    if (!item.dtype) return null;

    try {
        if (item.dtype.includes('Frame')) {
            return createFrame(item.data);
        } else if (item.dtype.includes('Box')) {
            return createBox(item.data);
        } else if (item.dtype.includes('Mesh')) {
            return createMesh(item.data);
        } else if (item.dtype.includes('Point')) {
            return createPoint(item.data);
        } else if (item.dtype.includes('Vector')) {
            return createArrow(item.data);
        }
    } catch (e) {
        console.warn("Failed to convert COMPAS geometry:", e);
    }

    return null;
}

function createFrame(data: any): THREE.Object3D {
    const group = new THREE.Group();

    const pt = data.point;
    const xaxis = data.xaxis;
    const yaxis = data.yaxis;
    const zaxis = new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2])
        .cross(new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]))
        .normalize();

    const origin = new THREE.Vector3(pt[0], pt[1], pt[2]);

    const xDir = new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2]).normalize();
    const yDir = new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]).normalize();
    const zDir = zaxis;

    const length = 1.0;

    const xArrow = new THREE.ArrowHelper(xDir, origin, length, 0xFF0000);
    const yArrow = new THREE.ArrowHelper(yDir, origin, length, 0x00FF00);
    const zArrow = new THREE.ArrowHelper(zDir, origin, length, 0x0000FF);

    group.add(xArrow);
    group.add(yArrow);
    group.add(zArrow);

    return group;
}

function createBox(data: any): THREE.Object3D {
    const frame = data.frame;
    const xsize = data.xsize || 1;
    const ysize = data.ysize || 1;
    const zsize = data.zsize || 1;

    const geometry = new THREE.BoxGeometry(xsize, ysize, zsize);
    const material = new THREE.MeshNormalMaterial({ wireframe: false, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);

    if (frame) {
        const pt = frame.point;
        const xaxis = frame.xaxis;
        const yaxis = frame.yaxis;
        const zaxis = new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2])
            .cross(new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]))
            .normalize();

        const matrix = new THREE.Matrix4();
        matrix.makeBasis(
            new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2]),
            new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]),
            zaxis
        );
        matrix.setPosition(pt[0], pt[1], pt[2]);

        mesh.applyMatrix4(matrix);
    }

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    if (frame) line.applyMatrix4(mesh.matrix);

    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);

    return group;
}

function createMesh(data: any): THREE.Object3D | null {
    // COMPAS mesh can be nested - try different paths
    let meshData = data;
    
    if (data.data && (data.data.vertices || data.data.faces || data.data.vertex || data.data.face)) {
        meshData = data.data;
    } else if (data.value && (data.value.vertices || data.value.faces || data.value.vertex || data.value.face)) {
        meshData = data.value;
    }
    
    let verticesMap = meshData.vertices || meshData.vertex || {};
    let faces = meshData.faces || meshData.face || [];
    
    // Handle vertices as objects with {x, y, z} format
    const processedVerticesMap: { [key: string]: number[] } = {};
    for (const key in verticesMap) {
        const v = verticesMap[key];
        if (Array.isArray(v)) {
            processedVerticesMap[key] = v;
        } else if (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v) {
            processedVerticesMap[key] = [v.x, v.y, v.z];
        }
    }
    
    // Handle faces as objects with numbered keys
    let processedFaces: any[];
    if (Array.isArray(faces)) {
        processedFaces = faces;
    } else if (faces && typeof faces === 'object') {
        const sortedKeys = Object.keys(faces).sort((a, b) => parseInt(a) - parseInt(b));
        processedFaces = sortedKeys.map(key => faces[key]);
    } else {
        processedFaces = [];
    }
    
    if (Object.keys(processedVerticesMap).length === 0 || processedFaces.length === 0) {
        return null;
    }

    const geometry = new THREE.BufferGeometry();
    const positionBytes: number[] = [];

    processedFaces.forEach((face: any[]) => {
        if (face.length >= 3) {
            const v0 = processedVerticesMap[face[0]];
            for (let i = 1; i < face.length - 1; i++) {
                const v1 = processedVerticesMap[face[i]];
                const v2 = processedVerticesMap[face[i + 1]];
                if (v0 && v1 && v2) {
                    positionBytes.push(...v0, ...v1, ...v2);
                }
            }
        }
    });

    const vertices = new Float32Array(positionBytes);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333 }));

    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);
    return group;
}

function createPoint(data: any): THREE.Object3D {
    let x = 0, y = 0, z = 0;
    if (Array.isArray(data)) {
        [x, y, z] = data;
    } else {
        x = data.x; y = data.y; z = data.z;
    }

    const geometry = new THREE.SphereGeometry(0.1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    return mesh;
}

function createArrow(data: any): THREE.Object3D {
    let x = 0, y = 0, z = 0;
    if (Array.isArray(data)) {
        [x, y, z] = data;
    } else {
        x = data.x; y = data.y; z = data.z;
    }
    const dir = new THREE.Vector3(x, y, z).normalize();
    const origin = new THREE.Vector3(0, 0, 0);
    const length = Math.sqrt(x * x + y * y + z * z);
    return new THREE.ArrowHelper(dir, origin, length, 0xff00ff);
}
