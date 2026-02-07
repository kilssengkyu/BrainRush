import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Product } from '@capgo/native-purchases';

export const PRODUCT_IDS = {
    removeAds: 'remove_ads',
    pencils5: 'pencils_5',
    pencils20: 'pencils_20',
    pencils100: 'pencils_100',
} as const;

export type ShopProductId = typeof PRODUCT_IDS[keyof typeof PRODUCT_IDS];

let isInitialized = false;

const withTimeout = async <T,>(promise: Promise<T>, ms: number) => {
    return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), ms);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
};

const ensureReady = async () => {
    if (!Capacitor.isNativePlatform()) return false;
    if (isInitialized) return true;
    isInitialized = true;
    return true;
};

export const loadProducts = async (productIds: ShopProductId[]) => {
    const ready = await ensureReady();
    if (!ready) return [] as Product[];
    try {
        const { products } = await withTimeout(
            NativePurchases.getProducts({
                productIdentifiers: productIds,
                productType: PURCHASE_TYPE.INAPP,
            }),
            8000
        );
        return products ?? [];
    } catch (err) {
        console.error('NativePurchases.getProducts failed:', err);
        return [];
    }
};

export const purchaseProduct = async (productId: ShopProductId) => {
    const ready = await ensureReady();
    if (!ready) {
        throw new Error('Billing not supported');
    }
    return await NativePurchases.purchaseProduct({
        productIdentifier: productId,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
    });
};

export const restorePurchases = async () => {
    const ready = await ensureReady();
    if (!ready) {
        throw new Error('Billing not supported');
    }
    const result = await NativePurchases.restorePurchases();
    const customerInfo = (result as any)?.customerInfo ?? null;
    return customerInfo;
};

export const getPurchasedProductIds = (customerInfo: any): string[] => {
    if (!customerInfo) return [];
    const ids = customerInfo.allPurchasedProductIdentifiers;
    if (Array.isArray(ids)) return ids;
    if (ids && typeof ids === 'object') return Object.keys(ids);
    return [];
};

export const getTransactionId = (transaction: any): string | null => {
    if (!transaction) return null;
    return transaction.transactionId
        ?? transaction.transaction_id
        ?? transaction?.transaction?.transactionId
        ?? null;
};

export const consumePurchaseToken = async (purchaseToken: string) => {
    if (!purchaseToken) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    try {
        await (NativePurchases as any).consumePurchase({ purchaseToken });
    } catch (err) {
        console.error('consumePurchase failed:', err);
    }
};
