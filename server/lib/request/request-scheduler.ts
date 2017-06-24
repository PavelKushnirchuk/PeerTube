import * as Sequelize from 'sequelize'

import { database as db } from '../../initializers/database'
import { AbstractRequestScheduler } from './abstract-request-scheduler'
import { logger } from '../../helpers'
import {
  REQUESTS_LIMIT_PODS,
  REQUESTS_LIMIT_PER_POD
} from '../../initializers'
import { RequestEndpoint } from '../../../shared'

export type RequestSchedulerOptions = {
  type: string
  endpoint: RequestEndpoint
  data: Object
  toIds: number[]
  transaction: Sequelize.Transaction
}

class RequestScheduler extends AbstractRequestScheduler {
  constructor () {
    super()

    // We limit the size of the requests
    this.limitPods = REQUESTS_LIMIT_PODS
    this.limitPerPod = REQUESTS_LIMIT_PER_POD

    this.description = 'requests'
  }

  getRequestModel () {
    return db.Request
  }

  getRequestToPodModel () {
    return db.RequestToPod
  }

  buildRequestObjects (requests: { [ toPodId: number ]: any }) {
    const requestsToMakeGrouped = {}

    Object.keys(requests).forEach(toPodId => {
      requests[toPodId].forEach(data => {
        const request = data.request
        const pod = data.pod
        const hashKey = toPodId + request.endpoint

        if (!requestsToMakeGrouped[hashKey]) {
          requestsToMakeGrouped[hashKey] = {
            toPod: pod,
            endpoint: request.endpoint,
            ids: [], // request ids, to delete them from the DB in the future
            datas: [] // requests data,
          }
        }

        requestsToMakeGrouped[hashKey].ids.push(request.id)
        requestsToMakeGrouped[hashKey].datas.push(request.request)
      })
    })

    return requestsToMakeGrouped
  }

  createRequest ({ type, endpoint, data, toIds, transaction }: RequestSchedulerOptions, callback: (err: Error) => void) {
    // TODO: check the setPods works
    const podIds = []

    // If there are no destination pods abort
    if (toIds.length === 0) return callback(null)

    toIds.forEach(toPod => {
      podIds.push(toPod)
    })

    const createQuery = {
      endpoint,
      request: {
        type: type,
        data: data
      }
    }

    const dbRequestOptions: Sequelize.CreateOptions = {
      transaction
    }

    return db.Request.create(createQuery, dbRequestOptions).asCallback((err, request) => {
      if (err) return callback(err)

      return request.setPods(podIds, dbRequestOptions).asCallback(callback)
    })
  }

  // ---------------------------------------------------------------------------

  afterRequestsHook () {
    // Flush requests with no pod
    this.getRequestModel().removeWithEmptyTo(err => {
      if (err) logger.error('Error when removing requests with no pods.', { error: err })
    })
  }
}

// ---------------------------------------------------------------------------

export {
  RequestScheduler
}