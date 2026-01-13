export class SeededRandom {
    private _seed: number;

    constructor(seed: string) {
        // Simple hash to integer
        let h = 0xdeadbeef;
        for (let i = 0; i < seed.length; i++) {
            h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
        }
        this._seed = (h ^ h >>> 16) >>> 0;
    }

    // Returns a float between 0 and 1
    next(): number {
        this._seed = Math.imul(this._seed, 1664525) + 1013904223 | 0;
        return (this._seed >>> 0) / 4294967296;
    }

    // Returns integer min <= x < max
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min) + min);
    }

    // Returns a random item from an array
    pick<T>(array: T[]): T {
        return array[this.nextInt(0, array.length)];
    }

    // Shuffles an array (Fisher-Yates)
    shuffle<T>(array: T[]): T[] {
        const newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i + 1);
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    }
}
