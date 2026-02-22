'use client';

import React, { useState, useRef, useEffect } from 'react';

const MODELS = [
    {
        id: 'auto',
        displayName: 'Auto',
        description: 'Automatically selects best model based on query complexity',
        icon: '🔀'
    },
    {
        id: 'openai/gpt-oss-120b',
        displayName: 'GPT-OSS 120B',
        description: 'Premium — deep reasoning and complex tasks',
        icon: '🧠'
    },
    {
        id: 'openai/gpt-oss-20b',
        displayName: 'GPT-OSS 20B',
        description: 'Balanced — great speed-to-intelligence ratio',
        icon: '✨'
    },
    {
        id: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B',
        description: 'Powerful — strong citation following',
        icon: '🦙'
    },
    {
        id: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B',
        description: 'Speed — lightning fast for simple queries',
        icon: '⚡'
    },
    {
        id: 'mixtral-8x7b-32768',
        displayName: 'Mixtral 8x7B',
        description: 'Alternative — MoE, high context window',
        icon: '🌀'
    },
];

interface ModelSelectorProps {
    selectedModel: string;
    onModelChange: (model: string) => void;
}

export default function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const currentModel = MODELS.find(m => m.id === selectedModel) ?? MODELS[0];

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="model-selector-container" ref={ref}>
            <button
                className="model-selector-trigger"
                onClick={() => setIsOpen(prev => !prev)}
                title="Select AI model"
            >
                <span className="model-selector-icon">{currentModel.icon}</span>
                <span className="model-selector-name">{currentModel.displayName}</span>
                <span className="model-selector-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="model-selector-dropdown">
                    <p className="model-selector-header">Select Model</p>
                    {MODELS.map(model => (
                        <button
                            key={model.id}
                            className={`model-selector-option ${selectedModel === model.id ? 'active' : ''}`}
                            onClick={() => {
                                onModelChange(model.id);
                                setIsOpen(false);
                            }}
                        >
                            <span className="model-option-icon">{model.icon}</span>
                            <div className="model-option-text">
                                <span className="model-option-name">{model.displayName}</span>
                                <span className="model-option-desc">{model.description}</span>
                            </div>
                            {selectedModel === model.id && (
                                <span className="model-option-check">✓</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
