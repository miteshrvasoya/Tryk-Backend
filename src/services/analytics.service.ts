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
    // 1. Basic Counts
    const counts = await query(`
      SELECT 
        COUNT(*) as total_conversations,
        COALESCE(SUM(bot_message_count), 0) as questions_answered,
        COALESCE(AVG(resolved_in_seconds), 0) as avg_resolution_time
      FROM conversations
      WHERE shop_id = $1
    `, [shopId]);

    // 2. Avg Bot Response Time (from Messages)
    const timing = await query(`
       SELECT AVG(response_time_ms) as avg_response_ms
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.shop_id = $1 
       AND m.role = 'assistant' 
       AND m.response_time_ms > 0
    `, [shopId]);

    const row = counts.rows[0];
    const avgMs = parseFloat(timing.rows[0]?.avg_response_ms || 0);

    const questionsAnswered = parseInt(row.questions_answered) || 0;
    
    // Estimate: 3 minutes saved per question answered
    const savedHours = (questionsAnswered * 3) / 60;

    return {
        totalConversations: parseInt(row.total_conversations) || 0,
        questionsAnswered,
        avgResponseTime: Math.round(avgMs) + 'ms',
        savedHours: savedHours.toFixed(1),
        engagementRate: 'Active' // Placeholder or calculate
    };
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
