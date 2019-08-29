import * as dotenv from 'dotenv';
import { StoreType } from './constants/store';
import * as kafkaConstant from './constants/kafka';

dotenv.config();
const pickAndReplaceFromENV = (template: string) =>
  Object.keys(process.env).reduce((result: any, key: string) => {
    if (new RegExp(template).test(key)) {
      return {
        ...result,
        [key.replace(new RegExp(template), '')]: process.env[key],
      };
    }
    return result;
  }, {});

export const server = {
  enabled: process.env['server.enabled'] === 'true',
  port: +process.env['server.port'] || 8080,
  hostname: process.env['server.hostname'] || '127.0.0.1',
};

export const kafkaTopicName = {
  task: `${process.env['kafka.prefix'] || 'node'}.${kafkaConstant.PREFIX}.${
    kafkaConstant.TASK_TOPIC_NAME
  }`,
  systemTask: `${process.env['kafka.prefix'] || 'node'}.${
    kafkaConstant.PREFIX
  }.${kafkaConstant.SYSTEM_TASK_TOPIC_NAME}`,
  command: `${process.env['kafka.prefix'] || 'node'}.${kafkaConstant.PREFIX}.${
    kafkaConstant.COMMAND_TOPIC_NAME
  }`,
  event: `${process.env['kafka.prefix'] || 'node'}.${kafkaConstant.PREFIX}.${
    kafkaConstant.EVENT_TOPIC
  }`,
};

export const kafkaAdmin = {
  'client.id': 'saga-pm',
  ...pickAndReplaceFromENV('^kafka\\.conf\\.'),
  ...pickAndReplaceFromENV('^admin\\.kafka\\.conf\\.'),
};

export const kafkaConsumer = {
  'client.id': 'saga-pm',
  'enable.auto.commit': 'false',
  'group.id': 'saga-pm-consumer',
  ...pickAndReplaceFromENV('^kafka\\.conf\\.'),
  ...pickAndReplaceFromENV('^consumer\\.kafka\\.conf\\.'),
};

export const kafkaSystemConsumer = {
  'client.id': 'saga-pm',
  'enable.auto.commit': 'false',
  'group.id': 'saga-pm-system-consumer',
  ...pickAndReplaceFromENV('^kafka\\.conf\\.'),
  ...pickAndReplaceFromENV('^system-consumer\\.kafka\\.conf\\.'),
};

export const kafkaProducer = {
  'client.id': 'saga-pm',
  'compression.type': 'snappy',
  'retry.backoff.ms': '100',
  'enable.idempotence': 'true',
  'message.send.max.retries': '100000',
  'socket.keepalive.enable': 'true',
  'queue.buffering.max.messages': '10000',
  'queue.buffering.max.ms': '1',
  'batch.num.messages': '100',
  'delivery.report.only.error': 'true',
  dr_cb: 'true',
  ...pickAndReplaceFromENV('^kafka\\.conf\\.'),
  ...pickAndReplaceFromENV('^producer\\.kafka\\.conf\\.'),
};

export const taskDefinitionStore = {
  type: StoreType.ZooKeeper,
  zookeeperConfig: {
    root: '/saga-pm/task-definition',
    connectionString: process.env['task-definition.zookeeper.connections'],
    options: {
      sessionTimeout: 30000,
      spinDelay: 1000,
      retries: 0,
    },
  },
};

export const workflowDefinitionStore = {
  type: StoreType.ZooKeeper,
  zookeeperConfig: {
    root: '/saga-pm/workflow-definition',
    connectionString: process.env['workflow-definition.zookeeper.connections'],
    options: {
      sessionTimeout: 30000,
      spinDelay: 1000,
      retries: 0,
    },
  },
};

export const taskInstanceStore = {
  type: StoreType.MongoDB,
  mongoDBConfig: {
    uri: process.env['task-instance.mongodb.uri'],
    options: {
      useNewUrlParser: true,
      reconnectTries: Number.MAX_SAFE_INTEGER,
      poolSize: 100,
      useFindAndModify: false,
    },
  },
};

export const workflowInstanceStore = {
  type: StoreType.MongoDB,
  mongoDBConfig: {
    uri: process.env['workflow-instance.mongodb.uri'],
    options: {
      useNewUrlParser: true,
      reconnectTries: Number.MAX_SAFE_INTEGER,
      poolSize: 100,
      useFindAndModify: false,
    },
  },
};
