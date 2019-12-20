import koaRouter = require('koa-router');
import { eventStore } from '../../../../store';

export const router = new koaRouter();

router.get('/transaction/week', async (ctx: koaRouter.IRouterContext) => {
  const { status, now } = ctx.query;
  return eventStore.getWeeklyTransactionsByStatus(status, now);
});

router.get('/task/execute/week', async (ctx: koaRouter.IRouterContext) => {
  const { now } = ctx.query;
  return eventStore.getWeeklyTaskExecuteTime(now);
});