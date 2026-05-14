// web/lib/backend/services/orders.ts
import { unstable_cache } from 'next/cache';
import connectToDatabase from '@/lib/backend/db';
import { Order } from '@/lib/backend/models/Order';
import { ApiKey } from '@/lib/backend/models/ApiKey';
import { CACHE_TAGS } from '@/lib/backend/cache-tags';

export const getOrders = (dashboardId: string, limit = 50) =>
  unstable_cache(
    async (dId: string, l: number) => {
      await connectToDatabase();
      const keys = await ApiKey.find({ dashboardId: dId }).select('_id').lean();
      const keyIds = keys.map(k => k._id);

      const orders = await Order.find({ apiKeyId: { $in: keyIds } })
        .sort({ createdAt: -1 })
        .limit(l)
        .populate({ path: 'apiKeyId', select: 'label' })
        .lean();

      return orders.map((o: any) => ({
        id: String(o._id),
        status: o.status,
        amount_usdc: o.amountUsdc,
        payment_asset: o.paymentAsset,
        stellar_txid: o.stellarTxid,
        card_brand: o.cardBrand,
        error: o.error,
        created_at: o.createdAt,
        updated_at: o.updatedAt,
        api_key_id: o.apiKeyId?._id ? String(o.apiKeyId._id) : String(o.apiKeyId),
        api_key_label: o.apiKeyId?.label ?? null,
      }));
    },
    [CACHE_TAGS.ORDERS],
    { tags: [CACHE_TAGS.ORDERS] }
  )(dashboardId, limit);

export const getOrdersForAgent = (apiKeyId: string, limit = 50) =>
  unstable_cache(
    async (akId: string, l: number) => {
      await connectToDatabase();
      const orders = await Order.find({ apiKeyId: akId })
        .sort({ createdAt: -1 })
        .limit(l)
        .lean();

      return orders.map((o: any) => ({
        id: String(o._id),
        status: o.status,
        amount_usdc: o.amountUsdc,
        payment_asset: o.paymentAsset,
        stellar_txid: o.stellarTxid,
        card_brand: o.cardBrand,
        error: o.error,
        created_at: o.createdAt,
        updated_at: o.updatedAt,
        api_key_id: String(o.apiKeyId),
        api_key_label: null,
      }));
    },
    [CACHE_TAGS.ORDERS],
    { tags: [CACHE_TAGS.ORDERS] }
  )(apiKeyId, limit);
