import koa = require('koa');
import koaBodyparser = require('koa-bodyparser');
import koaCompress = require('koa-compress');
import koaRouter = require('koa-router');
import responseFormatter from './middlewares/responseFormatter';
import errorHandler from './middlewares/errorHandler';
import * as v1Router from './routers/v1';

export class Server {
  server: koa;
  port: number;
  hostname: string;

  constructor(
    port: number = 8080,
    hostname: string = '127.0.0.1',
    autoStart: boolean = false,
  ) {
    this.port = port;
    this.hostname = hostname;
    this.server = new koa();

    this.server.use(errorHandler);
    this.server.use(koaBodyparser());
    this.server.use(koaCompress());
    this.server.use(responseFormatter);

    const mainRouter = new koaRouter();

    mainRouter.use(
      '/v1',
      v1Router.router.routes(),
      v1Router.router.allowedMethods(),
    );

    mainRouter.all('*', () => {
      throw new Error('Route not found');
    });

    this.server.use(mainRouter.routes());

    if (autoStart) {
      this.start();
    }
  }

  start = () => {
    this.server.listen(this.port, this.hostname, () =>
      console.log(`Server listen at ${this.hostname}:${this.port}`),
    );
  };
}
