import { useEffect, useRef } from 'react';

const GRID_SPACING = 25;

const THEMES = {
    light: {
        grid: 'rgb(210, 105, 30)', // Terracotta
        blip: 'rgba(208, 167, 64, 0.08)', // Faint Terracotta
        glowingBlip: 'rgba(255, 215, 0, 0.2)', // Bright Gold
        blipGlow: 'rgba(255, 94, 0, 0.4)', // Gold glow
        bg: '#fff8e7' // Cosmic Latte
    },
    dark: {
        grid: 'rgb(80, 80, 80)', // Grey
        blip: 'rgba(255, 255, 255, 0.1)', // Faint white
        glowingBlip: 'rgba(255, 255, 255, 0.1)', // Faint White
        blipGlow: 'rgba(255, 255, 255, 0.8)', // White glow
        bg: '#000000' // Almost Black
    }
};

interface Blip {
    axis: 'horizontal' | 'vertical';
    index: number; // grid index
    position: number; // pixels along the line
    speed: number;
    headFunction: (t: number) => number; // Optional easing or variation? Nah, linear is fine.
    length: number;
    opacity: number;
    isGlowing: boolean;
}

export const BlueprintBackground = ({ theme = 'light' }: { theme?: 'light' | 'dark' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const blipsRef = useRef<Blip[]>([]);
    const gridOpacityRef = useRef<{ x: number[], y: number[] }>({ x: [], y: [] });

    useEffect(() => {
        const colors = THEMES[theme];
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = window.innerWidth;
        let height = window.innerHeight;

        const initGridOpacities = (w: number, h: number) => {
            const xCols = Math.ceil(w / GRID_SPACING) + 1;
            const yRows = Math.ceil(h / GRID_SPACING) + 1;

            gridOpacityRef.current.x = new Array(xCols).fill(0).map(() => Math.random() < 0.1 ? 0 : Math.random() * 0.05);
            gridOpacityRef.current.y = new Array(yRows).fill(0).map(() => Math.random() < 0.1 ? 0 : Math.random() * 0.05);
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            initGridOpacities(width, height);
        };

        window.addEventListener('resize', resize);
        resize();

        // Initialize some blips
        const createBlip = (): Blip => {
            const axis = Math.random() > 0.5 ? 'horizontal' : 'vertical';
            const index = Math.floor(Math.random() * (axis === 'horizontal' ? (height / GRID_SPACING) : (width / GRID_SPACING)));

            return {
                axis,
                index,
                position: Math.random() * (axis === 'horizontal' ? width : height),
                speed: 2 + Math.random() * 4,
                length: 50 + Math.random() * 100,
                opacity: 0.5 + Math.random() * 0.5,
                isGlowing: Math.random() < 0.2 // 20% chance of being a glowing blip
            };
        };

        for (let i = 0; i < 20; i++) {
            blipsRef.current.push(createBlip());
        }

        const drawGrid = (ctx: CanvasRenderingContext2D) => {
            ctx.lineWidth = 1;

            const matches = colors.grid.match(/\d+/g);
            if (!matches) return;
            const [r, g, b] = matches.map(Number);

            // Vertical lines
            gridOpacityRef.current.x.forEach((opacity, i) => {
                if (opacity <= 0.01) return;
                const x = i * GRID_SPACING;
                ctx.beginPath();
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            });

            // Horizontal lines
            gridOpacityRef.current.y.forEach((opacity, i) => {
                if (opacity <= 0.01) return;
                const y = i * GRID_SPACING;
                ctx.beginPath();
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            });
        };

        const drawBlips = (ctx: CanvasRenderingContext2D) => {
            ctx.lineCap = 'round';

            // First pass: Update all positions and handle respawn
            blipsRef.current.forEach((blip, i) => {
                blip.position += blip.speed;
                const boundary = blip.axis === 'horizontal' ? width : height;

                if (blip.position > boundary + blip.length) {
                    blipsRef.current[i] = createBlip();
                    blipsRef.current[i].position = -blipsRef.current[i].length;
                }
            });

            // Second pass: Draw subtle blips (no glow)
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            ctx.strokeStyle = colors.blip;
            ctx.beginPath();
            blipsRef.current.forEach(blip => {
                if (blip.isGlowing) return;

                if (blip.axis === 'horizontal') {
                    const y = blip.index * GRID_SPACING;
                    ctx.moveTo(blip.position, y);
                    ctx.lineTo(blip.position - blip.length, y);
                } else {
                    const x = blip.index * GRID_SPACING;
                    ctx.moveTo(x, blip.position);
                    ctx.lineTo(x, blip.position - blip.length);
                }
            });
            ctx.stroke();

            // Third pass: Draw glowing blips
            ctx.shadowBlur = 30;
            ctx.shadowColor = colors.blipGlow;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = colors.glowingBlip;

            ctx.beginPath();
            blipsRef.current.forEach(blip => {
                if (!blip.isGlowing) return;

                if (blip.axis === 'horizontal') {
                    const y = blip.index * GRID_SPACING;
                    ctx.moveTo(blip.position, y);
                    ctx.lineTo(blip.position - blip.length, y);
                } else {
                    const x = blip.index * GRID_SPACING;
                    ctx.moveTo(x, blip.position);
                    ctx.lineTo(x, blip.position - blip.length);
                }
            });
            ctx.stroke();
        };

        const render = () => {
            ctx.fillStyle = colors.bg;
            ctx.fillRect(0, 0, width, height);

            drawGrid(ctx);
            drawBlips(ctx);

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [theme]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none'
            }}
        />
    );
};
