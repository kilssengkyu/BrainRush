import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SeededRandom } from '../../utils/seededRandom';

interface NumberSliderProps {
    seed: string | null;
    onScore: (amount: number) => void;
}

interface Cell {
    id: string;
    value: number;
    row: number;
    col: number;
}

const NumberSlider: React.FC<NumberSliderProps> = ({ seed, onScore }) => {
    const { t } = useTranslation();
    const [grid, setGrid] = useState<Cell[]>([]);
    const [target, setTarget] = useState<number>(0);
    const [selectedCells, setSelectedCells] = useState<Cell[]>([]);
    const [currentSum, setCurrentSum] = useState<number>(0);
    const [isDragging, setIsDragging] = useState(false);
    const [rng, setRng] = useState<SeededRandom | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

    // Initialize RNG
    useEffect(() => {
        if (seed) {
            const newRng = new SeededRandom(seed + '_slider');
            setRng(newRng);
            initializeGame(newRng);
        }
    }, [seed]);

    const initializeGame = (random: SeededRandom) => {
        // Generate 5x5 grid with numbers 1-4
        const newGrid: Cell[] = [];
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                newGrid.push({
                    id: `${r}-${c}`,
                    value: Math.floor(random.next() * 4) + 1,
                    row: r,
                    col: c
                });
            }
        }
        setGrid(newGrid);
        generateTarget(random);
    };

    const generateTarget = (random: SeededRandom) => {
        // Target between 5 and 10
        setTarget(Math.floor(random.next() * 6) + 5);
    };

    const getCellAtPoint = (x: number, y: number) => {
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
            const id = el.getAttribute('data-cell-id');
            if (id) {
                return grid.find(c => c.id === id);
            }
        }
        return null;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (feedback) return;
        setIsDragging(true);
        const cell = getCellAtPoint(e.clientX, e.clientY);
        if (cell) {
            addToSelection(cell);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || feedback) return;
        const cell = getCellAtPoint(e.clientX, e.clientY);
        if (cell) {
            addToSelection(cell);
        }
    };

    const handlePointerUp = () => {
        if (!isDragging) return;
        setIsDragging(false);
        validateSelection();
    };

    const addToSelection = (cell: Cell) => {
        // Cannot select if already selected
        if (selectedCells.find(c => c.id === cell.id)) {
            // Optional: Backtracking logic could go here
            return;
        }

        // Must be adjacent to last selected
        if (selectedCells.length > 0) {
            const last = selectedCells[selectedCells.length - 1];
            const isAdjacent = Math.abs(last.row - cell.row) <= 1 && Math.abs(last.col - cell.col) <= 1; // 8-way connectivity
            // Or 4-way: Math.abs(last.row - cell.row) + Math.abs(last.col - cell.col) === 1
            if (!isAdjacent) return;
        }

        const newSelection = [...selectedCells, cell];
        const sum = newSelection.reduce((acc, c) => acc + c.value, 0);

        // Check if exceeded immediately
        if (sum > target) {
            // Feedback wrong immediately
            setSelectedCells(newSelection);
            setCurrentSum(sum);
            triggerFeedback('wrong', newSelection);
        } else {
            setSelectedCells(newSelection);
            setCurrentSum(sum);
        }
    };

    const validateSelection = () => {
        if (selectedCells.length === 0) return;

        if (currentSum === target) {
            triggerFeedback('correct', selectedCells);
        } else {
            // If dragging stopped and sum is not target, it's a fail (or just reset?)
            // Spec says "stopped and not 7 -> deduction"
            triggerFeedback('wrong', selectedCells);
        }
    };

    const triggerFeedback = (type: 'correct' | 'wrong', cells: Cell[]) => {
        setFeedback(type);

        if (type === 'correct') {
            onScore(10 * cells.length); // Score based on length? or fixed?

            setTimeout(() => {
                if (!rng) return;
                // Replace cells
                const newGrid = [...grid];
                cells.forEach(c => {
                    const idx = newGrid.findIndex(g => g.id === c.id);
                    if (idx !== -1) {
                        newGrid[idx] = {
                            ...newGrid[idx],
                            value: Math.floor(rng.next() * 4) + 1
                        };
                    }
                });
                setGrid(newGrid);
                generateTarget(rng);
                resetSelection();
            }, 100);
        } else {
            onScore(-20); // Penalty
            setTimeout(() => {
                resetSelection();
            }, 500);
        }
    };

    const resetSelection = () => {
        setSelectedCells([]);
        setCurrentSum(0);
        setFeedback(null);
    };

    return (
        <div
            className="w-full h-full flex flex-col items-center justify-center select-none touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div className="mb-4 text-center">
                <div className="text-gray-400 text-sm font-bold uppercase tracking-widest">{t('slider.target')}</div>
                <div className="text-6xl font-black text-white drop-shadow-lg">{target}</div>
                <div className={`mt-2 h-2 rounded-full transition-all duration-200 ${currentSum > target ? 'bg-red-500' : currentSum === target ? 'bg-green-500' : 'bg-gray-600'
                    }`} style={{ width: `${Math.min((currentSum / target) * 100, 100)}%`, maxWidth: '200px' }}></div>
                <div className="text-xl font-mono font-bold text-gray-300 mt-1">{currentSum} / {target}</div>
            </div>

            <div className="grid grid-cols-5 gap-2 p-4 bg-gray-800/50 rounded-2xl backdrop-blur-sm shadow-xl" ref={containerRef}>
                {grid.map((cell) => {
                    const isSelected = selectedCells.find(c => c.id === cell.id);
                    let bgClass = "bg-white text-gray-900";
                    if (isSelected) {
                        if (feedback === 'correct') bgClass = "bg-green-500 text-white scale-110 shadow-lg z-10";
                        else if (feedback === 'wrong') bgClass = "bg-red-500 text-white shake";
                        else bgClass = "bg-blue-500 text-white scale-105 shadow-md z-10";
                    }

                    return (
                        <motion.div
                            key={cell.id}
                            layoutId={cell.id}
                            data-cell-id={cell.id}
                            className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black cursor-pointer transition-colors ${bgClass}`}
                            whileTap={{ scale: 0.9 }}
                            animate={isSelected && feedback === 'wrong' ? { x: [-5, 5, -5, 5, 0] } : {}}
                        >
                            {cell.value}
                        </motion.div>
                    );
                })}
            </div>
            <p className="mt-6 text-gray-400 animate-pulse text-sm">{t('slider.instruction')}</p>
        </div>
    );
};

export default NumberSlider;
