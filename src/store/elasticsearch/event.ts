// import * as R from 'ramda';
import { Event } from '@melonade/melonade-declaration';
import { ElasticsearchStore } from '../elasticsearch';
import { IEventDataStore, IQuery } from '../../store';
import { IAllEventWithId } from '../../kafka';

// const mapEsReponseToEvent = R.compose(
//   R.map(R.prop('_source')),
//   R.pathOr([], ['hits', 'hits']),
// );

const ES_EVENTS_MAPPING = {
  events: {
    properties: {
      details: {
        properties: {
          ackTimeout: {
            type: 'date',
          },
          createTime: {
            type: 'date',
          },
          endTime: {
            type: 'date',
          },
          input: {
            type: 'object',
            enabled: false,
          },
          isRetried: {
            type: 'boolean',
          },
          output: {
            type: 'object',
            enabled: false,
          },
          parallelTasks: {
            type: 'object',
            enabled: false,
          },
          retries: {
            type: 'long',
          },
          retryDelay: {
            type: 'long',
          },
          startTime: {
            type: 'date',
          },
          status: {
            type: 'keyword',
          },
          taskId: {
            type: 'keyword',
          },
          taskName: {
            type: 'keyword',
          },
          taskReferenceName: {
            type: 'keyword',
          },
          timeout: {
            type: 'long',
          },
          transactionId: {
            type: 'keyword',
          },
          type: {
            type: 'keyword',
          },
          workflowDefinition: {
            properties: {
              description: {
                type: 'text',
              },
              failureStrategy: {
                type: 'keyword',
              },
              name: {
                type: 'keyword',
              },
              outputParameters: {
                type: 'object',
                enabled: false,
              },
              rev: {
                type: 'keyword',
              },
              tasks: {
                properties: {
                  ackTimeout: {
                    type: 'long',
                  },
                  inputParameters: {
                    type: 'object',
                    enabled: false,
                  },
                  name: {
                    type: 'keyword',
                  },
                  parallelTasks: {
                    properties: {
                      ackTimeout: {
                        type: 'long',
                      },
                      inputParameters: {
                        type: 'object',
                        enabled: false,
                      },
                      name: {
                        type: 'keyword',
                      },
                      retry: {
                        properties: {
                          delay: {
                            type: 'long',
                          },
                          limit: {
                            type: 'long',
                          },
                        },
                      },
                      taskReferenceName: {
                        type: 'keyword',
                      },
                      timeout: {
                        type: 'long',
                      },
                      type: {
                        type: 'keyword',
                      },
                    },
                  },
                  retry: {
                    properties: {
                      delay: {
                        type: 'long',
                      },
                      limit: {
                        type: 'long',
                      },
                    },
                  },
                  taskReferenceName: {
                    type: 'keyword',
                  },
                  timeout: {
                    type: 'long',
                  },
                  type: {
                    type: 'keyword',
                  },
                },
              },
            },
          },
          workflowId: {
            type: 'keyword',
          },
        },
      },
      isError: {
        type: 'boolean',
      },
      timestamp: {
        type: 'date',
      },
      transactionId: {
        type: 'keyword',
      },
      type: {
        type: 'keyword',
      },
    },
  },
};

export class EventElasticsearchStore extends ElasticsearchStore
  implements IEventDataStore {
  index: string;
  constructor(config: any, index: string) {
    super(config);
    this.index = index;
    this.client.indices
      .create({
        index: index,
        body: {
          mappings: ES_EVENTS_MAPPING,
        },
      })
      .catch((error: any) => console.log(error.message));
  }

  get = async (transactionId: string): Promise<Event.AllEvent[]> => {
    // const response = await this.client.search({
    //   index: this.index,
    //   type: 'events',
    //   body: {
    //     from: 0,
    //     size: 1,
    //     query: {
    //       match_phrase: {
    //         transactionId,
    //       },
    //     },
    //   },
    // });

    // return mapEsReponseToEvent(response);
    console.log(transactionId);
    return [];
  };

  query = async (
    query: IQuery,
    limit: number,
    page: number,
  ): Promise<Event.AllEvent[]> => {
    console.log(query, limit, page);
    return [];
  };

  create = async (event: Event.AllEvent): Promise<Event.AllEvent> => {
    await this.client.index({
      index: this.index,
      type: 'events',
      body: event,
    });

    return event;
  };

  bulkCreate = async (events: IAllEventWithId[]): Promise<any> => {
    const resp = await this.client.bulk({
      body: events.reduce((result: any[], event: IAllEventWithId) => {
        const { _id, event: eventData } = event;
        result.push({
          index: {
            _index: this.index,
            _type: 'events',
            _id,
          },
        });
        result.push(eventData);
        return result;
      }, []),
    });
    if (resp.errors) throw new Error('Fail to inserts');
    return events;
  };
}
