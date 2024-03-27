import {
  BlockHeader,
  SubstrateBatchProcessor,
  SubstrateBatchProcessorFields,
  Event as _Event,
} from '@subsquid/substrate-processor'
import { TypeormDatabase } from '@subsquid/typeorm-store'
import { Logger } from './logger'
import { processVideoCreatedEvent, processVideoUpdatedEvent } from './mappings/content'
import {
  processDataObjectsDeletedEvent,
  processDataObjectsMovedEvent,
  processDataObjectsUpdatedEvent,
  processDataObjectsUploadedEvent,
  processDistributionBucketCreatedEvent,
  processDistributionBucketDeletedEvent,
  processDistributionBucketFamilyCreatedEvent,
  processDistributionBucketFamilyDeletedEvent,
  processDistributionBucketFamilyMetadataSetEvent,
  processDistributionBucketInvitationAcceptedEvent,
  processDistributionBucketInvitationCancelledEvent,
  processDistributionBucketMetadataSetEvent,
  processDistributionBucketModeUpdatedEvent,
  processDistributionBucketOperatorInvitedEvent,
  processDistributionBucketOperatorRemovedEvent,
  processDistributionBucketStatusUpdatedEvent,
  processDistributionBucketsUpdatedForBagEvent,
  processDynamicBagCreatedEvent,
  processDynamicBagDeletedEvent,
  processPendingDataObjectsAcceptedEvent,
  processStorageBucketCreatedEvent,
  processStorageBucketDeletedEvent,
  processStorageBucketInvitationAcceptedEvent,
  processStorageBucketInvitationCancelledEvent,
  processStorageBucketOperatorInvitedEvent,
  processStorageBucketOperatorRemovedEvent,
  processStorageBucketStatusUpdatedEvent,
  processStorageBucketVoucherLimitsSetEvent,
  processStorageBucketsUpdatedForBagEvent,
  processStorageOperatorMetadataSetEvent,
  processVoucherChangedEvent,
} from './mappings/storage'
import {
  processWorkingGroupsLeadRemarkedEvent,
  processWorkingGroupsWorkerRemarkedEvent,
} from './mappings/workingGroups'
import { events } from './types'
import { EntityManagerOverlay } from './utils/overlay'

const PROCESSOR = new SubstrateBatchProcessor().setFields({
  extrinsic: { hash: true },
  block: { timestamp: true },
})

type Fields = SubstrateBatchProcessorFields<typeof PROCESSOR>
export type Block = BlockHeader<Fields>
export type Event = _Event<Fields>

type MapModuleEvents<Module extends keyof typeof events> = {
  [Event in keyof typeof events[Module] &
    string as `${Capitalize<Module>}.${Capitalize<Event>}`]: typeof events[Module][Event]
}

type EventsMap = MapModuleEvents<'content'> &
  MapModuleEvents<'storage'> &
  MapModuleEvents<'storageWorkingGroup'> &
  MapModuleEvents<'distributionWorkingGroup'>
type EventNames = keyof EventsMap

export type EventHandlerContext<EventName extends EventNames> = {
  overlay: EntityManagerOverlay
  block: Block
  indexInBlock: number
  extrinsicHash?: string
  event: Event
  eventDecoder: EventsMap[EventName]
}

export type EventHandler<EventName extends EventNames> =
  | ((ctx: EventHandlerContext<EventName>) => void)
  | ((ctx: EventHandlerContext<EventName>) => Promise<void>)

type EventHandlers = { [Event in keyof EventsMap]: EventHandler<Event> }

const eventHandlers: EventHandlers = {
  'Content.VideoCreated': processVideoCreatedEvent,
  'Content.VideoUpdated': processVideoUpdatedEvent,
  'Storage.StorageBucketCreated': processStorageBucketCreatedEvent,
  'Storage.StorageBucketInvitationAccepted': processStorageBucketInvitationAcceptedEvent,
  'Storage.StorageBucketsUpdatedForBag': processStorageBucketsUpdatedForBagEvent,
  'Storage.StorageOperatorMetadataSet': processStorageOperatorMetadataSetEvent,
  'Storage.StorageBucketVoucherLimitsSet': processStorageBucketVoucherLimitsSetEvent,
  'Storage.PendingDataObjectsAccepted': processPendingDataObjectsAcceptedEvent,
  'Storage.StorageBucketInvitationCancelled': processStorageBucketInvitationCancelledEvent,
  'Storage.StorageBucketOperatorInvited': processStorageBucketOperatorInvitedEvent,
  'Storage.StorageBucketOperatorRemoved': processStorageBucketOperatorRemovedEvent,
  'Storage.StorageBucketStatusUpdated': processStorageBucketStatusUpdatedEvent,
  'Storage.StorageBucketDeleted': processStorageBucketDeletedEvent,
  'Storage.VoucherChanged': processVoucherChangedEvent,
  'Storage.DynamicBagCreated': processDynamicBagCreatedEvent,
  'Storage.DynamicBagDeleted': processDynamicBagDeletedEvent,
  'Storage.DataObjectsUploaded': processDataObjectsUploadedEvent,
  'Storage.DataObjectsUpdated': processDataObjectsUpdatedEvent,
  'Storage.DataObjectsMoved': processDataObjectsMovedEvent,
  'Storage.DataObjectsDeleted': processDataObjectsDeletedEvent,
  'Storage.DistributionBucketCreated': processDistributionBucketCreatedEvent,
  'Storage.DistributionBucketStatusUpdated': processDistributionBucketStatusUpdatedEvent,
  'Storage.DistributionBucketDeleted': processDistributionBucketDeletedEvent,
  'Storage.DistributionBucketsUpdatedForBag': processDistributionBucketsUpdatedForBagEvent,
  'Storage.DistributionBucketModeUpdated': processDistributionBucketModeUpdatedEvent,
  'Storage.DistributionBucketOperatorInvited': processDistributionBucketOperatorInvitedEvent,
  'Storage.DistributionBucketInvitationCancelled':
    processDistributionBucketInvitationCancelledEvent,
  'Storage.DistributionBucketInvitationAccepted': processDistributionBucketInvitationAcceptedEvent,
  'Storage.DistributionBucketMetadataSet': processDistributionBucketMetadataSetEvent,
  'Storage.DistributionBucketOperatorRemoved': processDistributionBucketOperatorRemovedEvent,
  'Storage.DistributionBucketFamilyCreated': processDistributionBucketFamilyCreatedEvent,
  'Storage.DistributionBucketFamilyMetadataSet': processDistributionBucketFamilyMetadataSetEvent,
  'Storage.DistributionBucketFamilyDeleted': processDistributionBucketFamilyDeletedEvent,
  'StorageWorkingGroup.LeadRemarked': processWorkingGroupsLeadRemarkedEvent,
  'StorageWorkingGroup.WorkerRemarked': processWorkingGroupsWorkerRemarkedEvent,
  'DistributionWorkingGroup.LeadRemarked': processWorkingGroupsLeadRemarkedEvent,
  'DistributionWorkingGroup.WorkerRemarked': processWorkingGroupsWorkerRemarkedEvent,
}

const eventNames = Object.keys(eventHandlers)

const archiveUrl = process.env.ARCHIVE_GATEWAY_URL

const rpcURL = process.env.RPC_ENDPOINT || 'http://localhost:9944/'
const rpcRateLimit = parseInt(process.env.RPC_RATE_LIMIT || '10')

const maxCachedEntities = parseInt(process.env.MAX_CACHED_ENTITIES || '1000')

PROCESSOR.setDataSource({
  ...(archiveUrl ? { archive: archiveUrl } : {}),
  chain: {
    url: rpcURL,
    rateLimit: rpcRateLimit,
  },
}).addEvent({
  name: eventNames,
  extrinsic: true,
  call: true,
})

type ModuleNames = keyof typeof events
type EventNamesInModule<M extends ModuleNames> = keyof typeof events[M]

async function processEvent<EventName extends EventNames>(
  eventName: EventName,
  block: Block,
  indexInBlock: number,
  extrinsicHash: string | undefined,
  event: Event,
  overlay: EntityManagerOverlay
) {
  const eventHandler = eventHandlers[eventName]
  const [module, name] = eventName
    .split('.')
    .map((str) => str.charAt(0).toLowerCase() + str.slice(1))
  const moduleName = module as ModuleNames
  const eventNameInModule = name as EventNamesInModule<typeof moduleName>
  const eventDecoder = events[moduleName][eventNameInModule] as EventsMap[EventName]
  await eventHandler({ block, overlay, event, eventDecoder, indexInBlock, extrinsicHash })
}

PROCESSOR.run(
  new TypeormDatabase({ isolationLevel: 'READ COMMITTED', supportHotBlocks: false }),
  async (ctx) => {
    Logger.set(ctx.log)

    const overlay = await EntityManagerOverlay.create(ctx.store)

    for (const block of ctx.blocks) {
      for (const event of block.events) {
        if (event.name !== '*') {
          ctx.log.info(`Processing ${event.name} event in block ${block.header.height}...`)

          await processEvent(
            event.name as EventNames,
            block.header,
            event.index,
            event.extrinsic?.hash,
            event,
            overlay
          )
          // Update database if the number of cached entities exceeded MAX_CACHED_ENTITIES
          if (overlay.totalCacheSize() > maxCachedEntities) {
            ctx.log.info(
              `Max memory cache size of ${maxCachedEntities} exceeded, updating database...`
            )
            await overlay.updateDatabase()
          }
        }
      }
    }

    ctx.log.info(`Saving database updates...`)
    await overlay.updateDatabase()
  }
)
