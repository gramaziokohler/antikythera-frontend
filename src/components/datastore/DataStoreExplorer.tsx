import { useState, useMemo } from 'react';
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
}

export function DataStoreExplorer({ data, mainBlueprintId }: DataStoreExplorerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);

    // Flatten and organize data
    const dataItems = useMemo(() => {
        const items: DataKey[] = [];

        // Helper to process a dict of keys
        const processDict = (dict: any, bpId: string) => {
            Object.entries(dict).forEach(([key, val]: [string, any]) => {
                // Backend now returns { value: ..., type: ... } wrapper
                // gracefully handle if it's not wrapped (legacy)
                let value = val;
                let type: 'text' | 'number' | 'geometry' | 'json' = 'json';

                if (val && typeof val === 'object' && val.type && val.value !== undefined) {
                    value = val.value;
                    type = val.type;
                } else {
                    // Infer basic legacy types
                    if (typeof val === 'number') type = 'number';
                    else if (typeof val === 'string') type = 'text';
                    else if (val && val.dtype) type = 'geometry'; // simple guess
                }

                items.push({
                    key,
                    value,
                    type,
                    blueprintId: bpId
                });
            });
        };

        if (data.main_blueprint) {
            processDict(data.main_blueprint, mainBlueprintId);
        }

        if (data.inner_blueprints) {
            Object.entries(data.inner_blueprints).forEach(([bpId, bpData]: [string, any]) => {
                processDict(bpData, bpId);
            });
        }

        return items;
    }, [data, mainBlueprintId]);

    // Group by Blueprint ID
    const groupedItems = useMemo(() => {
        const groups: Record<string, DataKey[]> = {};
        dataItems.forEach(item => {
            if (!groups[item.blueprintId]) groups[item.blueprintId] = [];
            groups[item.blueprintId].push(item);
        });
        return groups;
    }, [dataItems]);

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
                    {Object.entries(groupedItems).map(([bpId, items]) => (
                        <div key={bpId} className="blueprint-group">
                            <div className="blueprint-header">{bpId}</div>
                            {items.map(item => (
                                <div
                                    key={item.key}
                                    className={`data-key-item ${selectedKey === item.key && selectedBlueprintId === bpId ? 'selected' : ''}`}
                                    onClick={() => {
                                        setSelectedKey(item.key);
                                        setSelectedBlueprintId(bpId);
                                    }}
                                >
                                    <span className="key-name">{item.key}</span>
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

                <div className="data-preview-pane">
                    {renderViewer()}
                </div>
            </div>
        </div>
    );
}
