import { hexToString } from '@polkadot/util'
import {
  DataObjectDeletedEventData,
  DistributionBucketOperator,
  DistributionBucketOperatorMetadata,
  Event,
  StorageBag,
  StorageBagOwner,
  StorageBagOwnerChannel,
  StorageBagOwnerCouncil,
  StorageBagOwnerMember,
  StorageBagOwnerWorkingGroup,
  StorageDataObject,
  VideoSubtitle,
} from '../../model'
import { Block } from '../../processor'
import {
  BagIdType,
  DataObjectCreationParameters,
  DistributionBucketIdRecord,
  DynamicBagIdType,
  StaticBagId,
} from '../../types/v1000'
import { criticalError } from '../../utils/misc'
import { EntityManagerOverlay, Flat, RepositoryOverlay } from '../../utils/overlay'
import { genericEventFields } from '../utils'

export function getDynamicBagId(bagId: DynamicBagIdType): string {
  if (bagId.__kind === 'Channel') {
    return `dynamic:channel:${bagId.value.toString()}`
  }

  if (bagId.__kind === 'Member') {
    return `dynamic:member:${bagId.value.toString()}`
  }

  criticalError(`Unexpected dynamic bag type`, { bagId })
}

export function getStaticBagId(bagId: StaticBagId): string {
  if (bagId.__kind === 'Council') {
    return `static:council`
  }

  if (bagId.__kind === 'WorkingGroup') {
    return `static:wg:${bagId.value.__kind.toLowerCase()}`
  }

  criticalError(`Unexpected static bag type`, { bagId })
}

export function getBagId(bagId: BagIdType): string {
  return bagId.__kind === 'Static' ? getStaticBagId(bagId.value) : getDynamicBagId(bagId.value)
}

export function getDynamicBagOwner(bagId: DynamicBagIdType): StorageBagOwner {
  if (bagId.__kind === 'Channel') {
    return new StorageBagOwnerChannel({ channelId: bagId.value.toString() })
  }
  if (bagId.__kind === 'Member') {
    return new StorageBagOwnerMember({ memberId: bagId.value.toString() })
  }

  criticalError(`Unexpected dynamic bag type`, { bagId })
}

export function getStaticBagOwner(bagId: StaticBagId): StorageBagOwner {
  if (bagId.__kind === 'Council') {
    return new StorageBagOwnerCouncil()
  } else if (bagId.__kind === 'WorkingGroup') {
    return new StorageBagOwnerWorkingGroup({ workingGroupId: bagId.value.__kind.toLowerCase() })
  }

  criticalError(`Unexpected static bag type`, { bagId })
}

export function distributionBucketId({
  distributionBucketFamilyId: familyId,
  distributionBucketIndex: bucketIndex,
}: DistributionBucketIdRecord): string {
  return `${familyId.toString()}:${bucketIndex.toString()}`
}

export function distributionOperatorId(
  bucketId: DistributionBucketIdRecord,
  workerId: bigint
): string {
  return `${distributionBucketId(bucketId)}-${workerId.toString()}`
}

export function storageBucketBagData(
  bucketId: bigint | string,
  bagId: BagIdType | string
): { id: string; storageBucketId: string; bagId: string } {
  bagId = typeof bagId === 'string' ? bagId : getBagId(bagId)
  return {
    id: `${bucketId.toString()}-${bagId}`,
    storageBucketId: bucketId.toString(),
    bagId,
  }
}

export function distributionBucketBagData(
  bucketId: DistributionBucketIdRecord | string,
  bagId: BagIdType | string
): { id: string; distributionBucketId: string; bagId: string } {
  bucketId = typeof bucketId === 'string' ? bucketId : distributionBucketId(bucketId)
  bagId = typeof bagId === 'string' ? bagId : getBagId(bagId)
  return {
    id: `${bucketId}-${bagId}`,
    distributionBucketId: bucketId,
    bagId,
  }
}

export function createDataObjects(
  dataObjectRepository: RepositoryOverlay<StorageDataObject>,
  block: Block,
  storageBagId: string,
  objectCreationList: DataObjectCreationParameters[],
  stateBloatBond: bigint,
  objectIds: bigint[]
): Flat<StorageDataObject>[] {
  const dataObjects = objectCreationList.map((objectParams, i) => {
    const objectId = objectIds[i]
    const object = dataObjectRepository.new({
      id: objectId.toString(),
      createdAt: new Date(block.timestamp || ''),
      isAccepted: false,
      ipfsHash: hexToString(objectParams.ipfsContentId),
      size: objectParams.size,
      stateBloatBond,
      storageBagId,
    })
    return object
  })

  return dataObjects
}

export async function removeDistributionBucketOperator(
  overlay: EntityManagerOverlay,
  operatorId: string
) {
  overlay.getRepository(DistributionBucketOperator).remove(operatorId)
  overlay.getRepository(DistributionBucketOperatorMetadata).remove(operatorId)
}

export async function getOrCreateBag(
  overlay: EntityManagerOverlay,
  bagId: BagIdType
): Promise<Flat<StorageBag>> {
  const bagRepository = overlay.getRepository(StorageBag)
  const bag = await bagRepository.getById(getBagId(bagId))
  if (bag) {
    return bag
  }
  if (bagId.__kind === 'Dynamic') {
    criticalError(`Missing dynamic bag`, { id: bagId.value })
  }
  const newBag = bagRepository.new({
    id: getBagId(bagId),
    owner: getStaticBagOwner(bagId.value),
  })
  return newBag
}

export async function deleteDataObjects(
  overlay: EntityManagerOverlay,
  block: Block,
  indexInBlock: number,
  extrinsicHash: string | undefined,
  objects: Flat<StorageDataObject>[]
) {
  for (const object of objects) {
    // Add event for data object deletion
    overlay.getRepository(Event).new({
      ...genericEventFields(overlay, block, indexInBlock, extrinsicHash),
      data: new DataObjectDeletedEventData({
        dataObjectId: object.id,
      }),
    })

    // Remove data object
    overlay.getRepository(StorageDataObject).remove(object)
  }
}

export async function deleteDataObjectsByIds(
  overlay: EntityManagerOverlay,
  block: Block,
  indexInBlock: number,
  extrinsicHash: string | undefined,
  ids: bigint[]
) {
  const dataObjectRepository = overlay.getRepository(StorageDataObject)
  const subtitlesRepository = overlay.getRepository(VideoSubtitle)
  const objects = await Promise.all(
    ids.map((id) => dataObjectRepository.getByIdOrFail(id.toString()))
  )

  const currentSubtitles = await Promise.all(
    ids.map((id) => subtitlesRepository.getManyByRelation('assetId', id.toString()))
  )

  subtitlesRepository.remove(...currentSubtitles.flat())
  await deleteDataObjects(overlay, block, indexInBlock, extrinsicHash, objects)
}
