import * as config from './config';
import { executor as eventExecutor } from './event';
import './kafka';
import { Server } from './server';
import * as store from './store';
import { EventElasticsearchStore } from './store/elasticsearch/event';

switch (config.eventStore.type) {
  case store.StoreType.Elasticsearch:
    store.eventStore.setClient(
      new EventElasticsearchStore(
        config.eventStore.elasticsearchConfig.config,
        config.eventStore.elasticsearchConfig.index,
      ),
    );
    break;
  default:
    throw new Error(`EventStore Store: ${config.eventStore.type} is invalid`);
}

if (config.server.enabled) {
  new Server(config.server.port, config.server.hostname, true);
}

eventExecutor();
