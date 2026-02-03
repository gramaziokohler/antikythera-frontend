import * as THREE from 'three';

// Basic type definitions for COMPAS data structure
interface CompasData {
    dtype: string;
    data: any;
}

export function convertCompasDataToThree(item: CompasData): THREE.Object3D | null {
    if (!item || !item.dtype) return null;

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
            // Visualize vector from origin? or just text? 
            // Let's create an arrow from origin
            return createArrow(item.data);
        }
    } catch (e) {
        console.warn("Failed to convert COMPAS geometry:", e);
    }

    return null;
}

function createFrame(data: any): THREE.Object3D {
    const group = new THREE.Group();

    // Parse point and vectors
    const pt = data.point; // [x, y, z]
    const xaxis = data.xaxis;
    const yaxis = data.yaxis;
    const zaxis = new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2])
        .cross(new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]))
        .normalize();

    const origin = new THREE.Vector3(pt[0], pt[1], pt[2]);

    // Axes Helper
    // But standard axes helper is X=R, Y=G, Z=B. 
    // Custom arrow helpers
    const xDir = new THREE.Vector3(xaxis[0], xaxis[1], xaxis[2]).normalize();
    const yDir = new THREE.Vector3(yaxis[0], yaxis[1], yaxis[2]).normalize();
    const zDir = zaxis;

    const length = 1.0; // Default size, maybe scale based on scene?

    const xArrow = new THREE.ArrowHelper(xDir, origin, length, 0xFF0000);
    const yArrow = new THREE.ArrowHelper(yDir, origin, length, 0x00FF00);
    const zArrow = new THREE.ArrowHelper(zDir, origin, length, 0x0000FF);

    group.add(xArrow);
    group.add(yArrow);
    group.add(zArrow);

    return group;
}

function createBox(data: any): THREE.Object3D {
    const frame = data.frame; // Box usually has a frame
    const xsize = data.xsize || 1;
    const ysize = data.ysize || 1;
    const zsize = data.zsize || 1;

    const geometry = new THREE.BoxGeometry(xsize, ysize, zsize);
    const material = new THREE.MeshNormalMaterial({ wireframe: false, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);

    if (frame) {
        // Transform mesh to frame
        // COMPAS Box centered at frame?
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

    // Add wireframe for better visibility
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    if (frame) line.applyMatrix4(mesh.matrix);

    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);

    return group;
}

function createMesh(data: any): THREE.Object3D {
    // data.vertices: { "key": [x,y,z] } or [[x,y,z]]? 
    // COMPAS serialized Mesh usually has vertices as dictionary key->coords 
    // and faces as list of vertex keys

    const verticesMap = data.vertices;
    const faces = data.faces; // List of lists of keys

    const geometry = new THREE.BufferGeometry();
    const positionBytes: number[] = [];

    // Triangulate faces roughly
    faces.forEach((face: any[]) => {
        // Simple fan triangulation for n-gons (assuming convex/planar)
        if (face.length >= 3) {
            const v0 = verticesMap[face[0]]; // [x, y, z] or {x, y, z}? COMPAS JSON is [x, y, z]
            for (let i = 1; i < face.length - 1; i++) {
                const v1 = verticesMap[face[i]];
                const v2 = verticesMap[face[i + 1]];
                positionBytes.push(...v0, ...v1, ...v2);
            }
        }
    });

    const vertices = new Float32Array(positionBytes);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);

    // Wireframe
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333 }));

    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);
    return group;
}

function createPoint(data: any): THREE.Object3D {
    // data is [x, y, z] or {x, y, z}?
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
