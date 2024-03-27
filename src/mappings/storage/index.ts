import {
  DistributionBucketFamilyMetadata,
  DistributionBucketOperatorMetadata,
  StorageBucketOperatorMetadata,
} from '@joystream/metadata-protobuf'
import { hexToU8a } from '@polkadot/util'
import {
  DistributionBucket,
  DistributionBucketBag,
  DistributionBucketFamily,
  DistributionBucketFamilyMetadata as DistributionBucketFamilyMetadataEntity,
  DistributionBucketOperator,
  DistributionBucketOperatorStatus,
  StorageBag,
  StorageBucket,
  StorageBucketBag,
  StorageBucketOperatorMetadata as StorageBucketOperatorMetadataEntity,
  StorageBucketOperatorStatusActive,
  StorageBucketOperatorStatusInvited,
  StorageBucketOperatorStatusMissing,
  StorageDataObject,
} from '../../model'
import { EventHandlerContext } from '../../processor'
import { deserializeMetadataStr, toAddress } from '../utils'
import {
  processDistributionBucketFamilyMetadata,
  processDistributionOperatorMetadata,
  processStorageOperatorMetadata,
} from './metadata'
import {
  createDataObjects,
  deleteDataObjects,
  deleteDataObjectsByIds,
  distributionBucketBagData,
  distributionBucketId,
  distributionOperatorId,
  getDynamicBagId,
  getDynamicBagOwner,
  getOrCreateBag,
  removeDistributionBucketOperator,
  storageBucketBagData,
} from './utils'

// STORAGE BUCKET EVENTS

export async function processStorageBucketCreatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketCreated'>) {
  const [bucketId, invitedWorkerId, acceptingNewBags, dataObjectsSizeLimit, dataObjectCountLimit] =
    eventDecoder.v1000.decode(event)
  const storageBucket = overlay.getRepository(StorageBucket).new({
    id: bucketId.toString(),
    acceptingNewBags,
    dataObjectCountLimit,
    dataObjectsSizeLimit,
    dataObjectsCount: 0n,
    dataObjectsSize: 0n,
  })
  if (invitedWorkerId !== undefined) {
    storageBucket.operatorStatus = new StorageBucketOperatorStatusInvited({
      workerId: invitedWorkerId,
    })
  } else {
    storageBucket.operatorStatus = new StorageBucketOperatorStatusMissing()
  }
}

export async function processStorageOperatorMetadataSetEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageOperatorMetadataSet'>): Promise<void> {
  const [bucketId, , metadataBytes] = eventDecoder.v1000.decode(event)
  const metadataUpdate = deserializeMetadataStr(StorageBucketOperatorMetadata, metadataBytes)
  if (metadataUpdate) {
    await processStorageOperatorMetadata(overlay, bucketId.toString(), metadataUpdate)
  }
}

export async function processStorageBucketStatusUpdatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketStatusUpdated'>): Promise<void> {
  const [bucketId, acceptingNewBags] = eventDecoder.v1000.decode(event)
  const storageBucket = await overlay
    .getRepository(StorageBucket)
    .getByIdOrFail(bucketId.toString())
  storageBucket.acceptingNewBags = acceptingNewBags
}

export async function processStorageBucketInvitationAcceptedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketInvitationAccepted'>): Promise<void> {
  const [bucketId, workerId, transactorAccountId] = eventDecoder.v1000.decode(event)
  const storageBucket = await overlay
    .getRepository(StorageBucket)
    .getByIdOrFail(bucketId.toString())
  storageBucket.operatorStatus = new StorageBucketOperatorStatusActive({
    workerId,
    transactorAccountId: toAddress(hexToU8a(transactorAccountId)),
  })
}

export async function processStorageBucketInvitationCancelledEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketInvitationCancelled'>): Promise<void> {
  const bucketId = eventDecoder.v1000.decode(event)
  // Metadata should not exist, because the operator wasn't active
  const storageBucket = await overlay
    .getRepository(StorageBucket)
    .getByIdOrFail(bucketId.toString())
  storageBucket.operatorStatus = new StorageBucketOperatorStatusMissing()
}

export async function processStorageBucketOperatorInvitedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketOperatorInvited'>): Promise<void> {
  const [bucketId, workerId] = eventDecoder.v1000.decode(event)
  const storageBucket = await overlay
    .getRepository(StorageBucket)
    .getByIdOrFail(bucketId.toString())
  storageBucket.operatorStatus = new StorageBucketOperatorStatusInvited({
    workerId,
  })
}

export async function processStorageBucketOperatorRemovedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketOperatorRemoved'>): Promise<void> {
  const bucketId = eventDecoder.v1000.decode(event)
  const storageBucket = await overlay
    .getRepository(StorageBucket)
    .getByIdOrFail(bucketId.toString())
  storageBucket.operatorStatus = new StorageBucketOperatorStatusMissing()
  overlay.getRepository(StorageBucketOperatorMetadataEntity).remove(storageBucket.id)
}

export async function processStorageBucketsUpdatedForBagEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketsUpdatedForBag'>): Promise<void> {
  const [bagId, addedBuckets, removedBuckets] = eventDecoder.v1000.decode(event)
  await getOrCreateBag(overlay, bagId)
  overlay
    .getRepository(StorageBucketBag)
    .remove(...removedBuckets.map((bucketId) => storageBucketBagData(bucketId, bagId)))
  addedBuckets.forEach((bucketId) =>
    overlay.getRepository(StorageBucketBag).new(storageBucketBagData(bucketId, bagId))
  )
}

export async function processVoucherChangedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.VoucherChanged'>): Promise<void> {
  const [bucketId, voucher] = eventDecoder.v1000.decode(event)
  const bucket = await overlay.getRepository(StorageBucket).getByIdOrFail(bucketId.toString())

  bucket.dataObjectCountLimit = voucher.objectsLimit
  bucket.dataObjectsSizeLimit = voucher.sizeLimit
  bucket.dataObjectsCount = voucher.objectsUsed
  bucket.dataObjectsSize = voucher.sizeUsed
}

export async function processStorageBucketVoucherLimitsSetEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketVoucherLimitsSet'>): Promise<void> {
  const [bucketId, sizeLimit, countLimit] = eventDecoder.v1000.decode(event)
  const bucket = await overlay.getRepository(StorageBucket).getByIdOrFail(bucketId.toString())
  bucket.dataObjectsSizeLimit = sizeLimit
  bucket.dataObjectCountLimit = countLimit
}

export async function processStorageBucketDeletedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.StorageBucketDeleted'>): Promise<void> {
  const bucketId = eventDecoder.v1000.decode(event)
  // There should be already no bags assigned - enforced by the runtime
  overlay.getRepository(StorageBucketOperatorMetadataEntity).remove(bucketId.toString())
  overlay.getRepository(StorageBucket).remove(bucketId.toString())
}

// DYNAMIC BAG EVENTS

export async function processDynamicBagCreatedEvent({
  overlay,
  block,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DynamicBagCreated'>) {
  const [
    {
      bagId,
      storageBuckets,
      distributionBuckets,
      objectCreationList,
      expectedDataObjectStateBloatBond,
    },
    objectIds,
  ] = eventDecoder.v1000.decode(event)
  const bag = overlay.getRepository(StorageBag).new({
    id: getDynamicBagId(bagId),
    owner: getDynamicBagOwner(bagId),
  })

  storageBuckets.map((id) =>
    overlay.getRepository(StorageBucketBag).new(storageBucketBagData(id, bag.id))
  )
  distributionBuckets.map((id) =>
    overlay.getRepository(DistributionBucketBag).new(distributionBucketBagData(id, bag.id))
  )
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  createDataObjects(
    dataObjectRepository,
    block,
    bag.id,
    objectCreationList,
    expectedDataObjectStateBloatBond,
    objectIds
  )
}

export async function processDynamicBagDeletedEvent({
  overlay,
  block,
  indexInBlock,
  extrinsicHash,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DynamicBagDeleted'>): Promise<void> {
  const bagId = eventDecoder.v1000.decode(event)
  const dynBagId = getDynamicBagId(bagId)
  const bagStorageBucketRelations = await overlay
    .getRepository(StorageBucketBag)
    .getManyByRelation('bagId', dynBagId)
  const bagDistributionBucketRelations = await overlay
    .getRepository(DistributionBucketBag)
    .getManyByRelation('bagId', dynBagId)
  const objects = await overlay
    .getRepository(StorageDataObject)
    .getManyByRelation('storageBagId', dynBagId)
  overlay.getRepository(StorageBucketBag).remove(...bagStorageBucketRelations)
  overlay.getRepository(DistributionBucketBag).remove(...bagDistributionBucketRelations)
  await deleteDataObjects(overlay, block, indexInBlock, extrinsicHash, objects)
  overlay.getRepository(StorageBag).remove(dynBagId)
}

// // DATA OBJECT EVENTS

export async function processDataObjectsUploadedEvent({
  overlay,
  block,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DataObjectsUploaded'>) {
  const [objectIds, { bagId, objectCreationList }, stateBloatBond] =
    eventDecoder.v1000.decode(event)
  const bag = await getOrCreateBag(overlay, bagId)
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  createDataObjects(
    dataObjectRepository,
    block,
    bag.id,
    objectCreationList,
    stateBloatBond,
    objectIds
  )
}

export async function processDataObjectsUpdatedEvent({
  overlay,
  block,
  indexInBlock,
  extrinsicHash,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DataObjectsUpdated'>): Promise<void> {
  const [
    { bagId, objectCreationList, expectedDataObjectStateBloatBond: stateBloatBond },
    uploadedObjectIds,
    objectsToRemoveIds,
  ] = eventDecoder.v1000.decode(event)
  const bag = await getOrCreateBag(overlay, bagId)
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  createDataObjects(
    dataObjectRepository,
    block,
    bag.id,
    objectCreationList,
    stateBloatBond,
    uploadedObjectIds
  )
  await deleteDataObjectsByIds(overlay, block, indexInBlock, extrinsicHash, objectsToRemoveIds)
}

export async function processPendingDataObjectsAcceptedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.PendingDataObjectsAccepted'>): Promise<void> {
  const [bucketId, , , dataObjectIds] = eventDecoder.v1000.decode(event)
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  const objects = await Promise.all(
    dataObjectIds.map((id) => dataObjectRepository.getByIdOrFail(id.toString()))
  )
  objects.forEach((o) => {
    o.isAccepted = true
    o.acceptingBucketId = bucketId
  })
}

export async function processDataObjectsMovedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DataObjectsMoved'>): Promise<void> {
  const [, destBagId, dataObjectIds] = eventDecoder.v1000.decode(event)
  const destBag = await getOrCreateBag(overlay, destBagId)
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  const dataObjects = await Promise.all(
    dataObjectIds.map((id) => dataObjectRepository.getByIdOrFail(id.toString()))
  )
  dataObjects.forEach((o) => {
    o.storageBagId = destBag.id
  })
}

export async function processDataObjectsDeletedEvent({
  overlay,
  block,
  indexInBlock,
  extrinsicHash,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DataObjectsDeleted'>): Promise<void> {
  const [, , dataObjectIds] = eventDecoder.v1000.decode(event)
  await deleteDataObjectsByIds(overlay, block, indexInBlock, extrinsicHash, dataObjectIds)
}

// DISTRIBUTION FAMILY EVENTS

export async function processDistributionBucketFamilyCreatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketFamilyCreated'>): Promise<void> {
  const familyId = eventDecoder.v1000.decode(event)
  const familyRepository = overlay.getRepository(DistributionBucketFamily)
  familyRepository.new({ id: familyId.toString() })
}

export async function processDistributionBucketFamilyMetadataSetEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketFamilyMetadataSet'>): Promise<void> {
  const [familyId, metadataBytes] = eventDecoder.v1000.decode(event)
  const metadataUpdate = deserializeMetadataStr(DistributionBucketFamilyMetadata, metadataBytes)
  if (metadataUpdate) {
    await processDistributionBucketFamilyMetadata(overlay, familyId.toString(), metadataUpdate)
  }
}

export async function processDistributionBucketFamilyDeletedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketFamilyDeleted'>): Promise<void> {
  const familyId = eventDecoder.v1000.decode(event)
  overlay.getRepository(DistributionBucketFamilyMetadataEntity).remove(familyId.toString())
  overlay.getRepository(DistributionBucketFamily).remove(familyId.toString())
}

// DISTRIBUTION BUCKET EVENTS

export async function processDistributionBucketCreatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketCreated'>): Promise<void> {
  const [familyId, acceptingNewBags, bucketId] = eventDecoder.v1000.decode(event)
  overlay.getRepository(DistributionBucket).new({
    id: distributionBucketId(bucketId),
    bucketIndex: Number(bucketId.distributionBucketIndex),
    acceptingNewBags,
    distributing: true, // Runtime default
    familyId: familyId.toString(),
  })
}

export async function processDistributionBucketStatusUpdatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketStatusUpdated'>): Promise<void> {
  const [bucketId, acceptingNewBags] = eventDecoder.v1000.decode(event)
  const bucket = await overlay
    .getRepository(DistributionBucket)
    .getByIdOrFail(distributionBucketId(bucketId))
  bucket.acceptingNewBags = acceptingNewBags
}

export async function processDistributionBucketDeletedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketDeleted'>): Promise<void> {
  const bucketId = eventDecoder.v1000.decode(event)
  // Operators and bags need to be empty (enforced by runtime)
  overlay.getRepository(DistributionBucket).remove(distributionBucketId(bucketId))
}

export async function processDistributionBucketsUpdatedForBagEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketsUpdatedForBag'>): Promise<void> {
  const [bagId, familyId, addedBucketsIndices, removedBucketsIndices] =
    eventDecoder.v1000.decode(event)
  await getOrCreateBag(overlay, bagId)
  overlay.getRepository(DistributionBucketBag).remove(
    ...removedBucketsIndices.map((index) =>
      distributionBucketBagData(
        {
          distributionBucketFamilyId: familyId,
          distributionBucketIndex: index,
        },
        bagId
      )
    )
  )
  addedBucketsIndices.forEach((index) =>
    overlay.getRepository(DistributionBucketBag).new(
      distributionBucketBagData(
        {
          distributionBucketFamilyId: familyId,
          distributionBucketIndex: index,
        },
        bagId
      )
    )
  )
}

export async function processDistributionBucketModeUpdatedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketModeUpdated'>): Promise<void> {
  const [bucketId, distributing] = eventDecoder.v1000.decode(event)
  const bucket = await overlay
    .getRepository(DistributionBucket)
    .getByIdOrFail(distributionBucketId(bucketId))
  bucket.distributing = distributing
}

export function processDistributionBucketOperatorInvitedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketOperatorInvited'>): void {
  const [bucketId, workerId] = eventDecoder.v1000.decode(event)
  const operatorRepository = overlay.getRepository(DistributionBucketOperator)
  operatorRepository.new({
    id: distributionOperatorId(bucketId, workerId),
    distributionBucketId: distributionBucketId(bucketId),
    status: DistributionBucketOperatorStatus.INVITED,
    workerId,
  })
}

export async function processDistributionBucketInvitationCancelledEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketInvitationCancelled'>): Promise<void> {
  const [bucketId, workerId] = eventDecoder.v1000.decode(event)
  // Metadata should not exist, because the operator wasn't active
  overlay
    .getRepository(DistributionBucketOperator)
    .remove(distributionOperatorId(bucketId, workerId))
}

export async function processDistributionBucketInvitationAcceptedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketInvitationAccepted'>): Promise<void> {
  const [workerId, bucketId] = eventDecoder.v1000.decode(event)
  const operator = await overlay
    .getRepository(DistributionBucketOperator)
    .getByIdOrFail(distributionOperatorId(bucketId, workerId))
  operator.status = DistributionBucketOperatorStatus.ACTIVE
}

export async function processDistributionBucketMetadataSetEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketMetadataSet'>): Promise<void> {
  const [workerId, bucketId, metadataBytes] = eventDecoder.v1000.decode(event)
  const metadataUpdate = deserializeMetadataStr(DistributionBucketOperatorMetadata, metadataBytes)
  if (metadataUpdate) {
    await processDistributionOperatorMetadata(
      overlay,
      distributionOperatorId(bucketId, workerId),
      metadataUpdate
    )
  }
}

export async function processDistributionBucketOperatorRemovedEvent({
  overlay,
  event,
  eventDecoder,
}: EventHandlerContext<'Storage.DistributionBucketOperatorRemoved'>): Promise<void> {
  const [bucketId, workerId] = eventDecoder.v1000.decode(event)
  await removeDistributionBucketOperator(overlay, distributionOperatorId(bucketId, workerId))
}
