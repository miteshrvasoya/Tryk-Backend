// import { analyticsQueue, connection } from '../lib/queue';
import { Worker, Job } from 'bullmq';
import { query } from '../db';

export class AnalyticsService {
  /**
   * Logs an analytics event to the queue.
   */
  static async logEvent(data: {
    shopId: string;
    eventType: string;
    intent?: string;
    responseTime?: number;
    confidence?: number;
    handled?: boolean;
    escalated?: boolean;
  }) {
    // await analyticsQueue.add('event', {
    //   ...data,
    //   timestamp: new Date()
    // });
  }

  /**
   * Fetches dashboard metrics for a shop.
   */
  static async getDashboardMetrics(shopId: string, period: string = 'today') {
    // In a real app, this would query the pre-aggregated analytics_daily table
    // For now, let's query the live sessions/messages as a fallback
    const result = await query(`
      SELECT 
        COUNT(*) as total_conversations,
        SUM(bot_message_count) as total_bot_messages,
        COUNT(CASE WHEN status = 'escalated' THEN 1 END) as total_escalations
      FROM conversations
      WHERE shop_id = $1
    `, [shopId]);

    return result.rows[0];
  }
}

// Analytics Worker
// const worker = new Worker('analyticsEvents', async (job: Job) => {
//   const { shopId, eventType, timestamp } = job.data;
//   const date = new Date(timestamp).toISOString().split('T')[0];

//   try {
//     // Upsert into analytics_daily for the current day
//     // This is a simplified version of real-time aggregation
//     await query(`
//       INSERT INTO analytics_daily (shop_id, date, total_conversations)
//       VALUES ($1, $2, 1)
//       ON CONFLICT (shop_id, date) 
//       DO UPDATE SET 
//         total_conversations = analytics_daily.total_conversations + 1,
//         updated_at = NOW()
//     `, [shopId, date]);

//     console.log(`Analytics: Processed ${eventType} for ${shopId}`);
//   } catch (error) {
//     console.error('Analytics worker error:', error);
//   }
// }, { connection });
