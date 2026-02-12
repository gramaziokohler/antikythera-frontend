import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import './DataStore.css';
import { GeometryViewer } from './GeometryViewer';

interface DataKey {
    key: string;
    value: any;
    type: 'text' | 'number' | 'geometry' | 'json';
    blueprintId: string;
}

interface DataStoreExplorerProps {
    data: any; // The raw session data object
    mainBlueprintId: string;
    params?: any;
}

const GEOMETRY_KEYWORDS = [
    'geometry', 'Mesh', 'Point', 'Line', 'Frame', 'Polygon', 'Polyline',
    'Box', 'Sphere', 'Cylinder', 'Cone', 'Capsule', 'Torus', 'Tubular',
    'Pointcloud', 'Brep'
];

function isGeometry(value: any): boolean {
    if (!value || typeof value !== 'object') return false;

    // Handle arrays of geometries
    if (Array.isArray(value)) {
        if (value.length === 0) return false;
        return isGeometry(value[0]);
    }

    // Check dtype field for geometry keywords
    if (value.dtype && GEOMETRY_KEYWORDS.some(kw => value.dtype.includes(kw))) {
        return true;
    }

    // Check nested data structure
    if (value.data?.dtype && GEOMETRY_KEYWORDS.some(kw => value.data.dtype.includes(kw))) {
        return true;
    }

    // Check for vertices/faces structure (typical of meshes)
    if ((value.vertices || value.points) && (value.faces || value.edges)) {
        return true;
    }

    return false;
}

function detectType(val: any): 'text' | 'number' | 'geometry' | 'json' {
    // Extract wrapped data (backend returns { value: ..., type: ... })
    const isWrapped = val && typeof val === 'object' && val.type && val.value !== undefined;
    const value = isWrapped ? val.value : val;
    const declaredType = isWrapped ? val.type : null;

    // If backend declared a specific type, use it (unless it's json which we might override)
    if (declaredType && declaredType !== 'json') {
        return declaredType;
    }

    // Check for geometry indicators
    if (isGeometry(value)) {
        return 'geometry';
    }

    // Basic type detection for primitives
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'text';

    return 'json';
}

function HighlightMatch({ text, match }: { text: string; match: string }) {
    if (!match || !text) return <>{text}</>;
    // Escape regex characters
    const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedMatch})`, 'gi'));
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === match.toLowerCase() ? (
                    <span key={index} className="highlight-match">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
}

export function DataStoreExplorer({ data, mainBlueprintId, params }: DataStoreExplorerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');

    // Flatten and organize data
    const dataItems = useMemo(() => {
        const items: DataKey[] = [];

        // Helper to process a dict of keys
        const processDict = (dict: any, bpId: string) => {
            Object.entries(dict).forEach(([key, val]: [string, any]) => {
                const isWrapped = val && typeof val === 'object' && val.type && val.value !== undefined;
                const value = isWrapped ? val.value : val;
                const type = detectType(val);

                items.push({
                    key,
                    value,
                    type,
                    blueprintId: bpId
                });
            });
        };

        if (params && Object.keys(params).length > 0) {
            processDict(params, 'Session Parameters');
        }

        if (data.main_blueprint) {
            processDict(data.main_blueprint, mainBlueprintId);
        }

        if (data.inner_blueprints) {
            Object.entries(data.inner_blueprints).forEach(([bpId, bpData]: [string, any]) => {
                processDict(bpData, bpId);
            });
        }

        return items;
    }, [data, mainBlueprintId, params]);

    // Group by Blueprint ID
    const groupedItems = useMemo(() => {
        const groups: Record<string, DataKey[]> = {};
        const lowerFilter = filterText.toLowerCase();

        dataItems.forEach(item => {
            const matchKey = item.key.toLowerCase().includes(lowerFilter);
            const matchGroup = item.blueprintId.toLowerCase().includes(lowerFilter);

            if (filterText && !matchKey && !matchGroup) {
                return;
            }

            if (!groups[item.blueprintId]) groups[item.blueprintId] = [];
            groups[item.blueprintId].push(item);
        });
        return groups;
    }, [dataItems, filterText]);

    const selectedItem = useMemo(() => {
        if (!selectedKey || !selectedBlueprintId) return null;
        return dataItems.find(i => i.key === selectedKey && i.blueprintId === selectedBlueprintId);
    }, [selectedKey, selectedBlueprintId, dataItems]);

    // Select first item by default if nothing selected
    if (!selectedKey && dataItems.length > 0) {
        // Defer selection to avoid render loop? No, default state.
        // Actually best to let user select, or select [0] in useEffect
    }

    const renderViewer = () => {
        if (!selectedItem) return <div className="empty-selection">Select a key to view data</div>;

        switch (selectedItem.type) {
            case 'geometry':
                return <GeometryViewer data={selectedItem} />;
            case 'text':
            case 'number':
                return (
                    <div className="text-viewer">
                        {String(selectedItem.value)}
                    </div>
                );
            case 'json':
            default:
                return (
                    <div className="json-viewer">
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {JSON.stringify(selectedItem.value, null, 2)}
                        </pre>
                    </div>
                );
        }
    };

    return (
        <div className="data-store-explorer">
            <div className="data-content">
                <div className="data-sidebar">
                    <div className="data-tree-list" style={{ flex: 1, overflowY: 'auto' }}>
                        {Object.entries(groupedItems).map(([bpId, items]) => (
                            <div key={bpId} className="blueprint-group">
                                <div className="blueprint-header">
                                    <HighlightMatch text={bpId} match={filterText} />
                                </div>
                                {items.map(item => (
                                    <div
                                        key={item.key}
                                        className={`data-key-item ${selectedKey === item.key && selectedBlueprintId === bpId ? 'selected' : ''}`}
                                        onClick={() => {
                                            setSelectedKey(item.key);
                                            setSelectedBlueprintId(bpId);
                                        }}
                                    >
                                        <span className="key-name">
                                            <HighlightMatch text={item.key} match={filterText} />
                                        </span>
                                        <span className={`type-indicator ${item.type}`}>{item.type}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {dataItems.length === 0 && (
                            <div style={{ padding: '1rem', color: '#999', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                Data store is empty.
                            </div>
                        )}
                    </div>
                    <div className="search-container">
                        <div className="search-input-wrapper">
                            <Search size={14} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Filter..."
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                className="search-input"
                            />
                            {filterText && (
                                <button
                                    onClick={() => setFilterText('')}
                                    className="search-clear-btn"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="data-preview-pane">
                    {renderViewer()}
                </div>
            </div>
        </div>
    );
}
