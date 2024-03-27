import { RemarkMetadataAction } from '@joystream/metadata-protobuf'
import { Block, EventHandlerContext } from '../../processor'
import { EntityManagerOverlay } from '../../utils/overlay'
import { processSetNodeOperationalStatusMessage } from '../storage/utils'
import { deserializeMetadataStr, invalidMetadata, toLowerFirstLetter } from '../utils'

export async function processWorkingGroupsLeadRemarkedEvent({
  overlay,
  block,
  event,
  indexInBlock,
  extrinsicHash,
  eventDecoder,
}: EventHandlerContext<
  'StorageWorkingGroup.LeadRemarked' | 'DistributionWorkingGroup.LeadRemarked'
>) {
  const [metadataBytes] = eventDecoder.v1000.decode(event)

  // Get the working group name
  const [workingGroup] = event.name.split('.')
  const workingGroupName = toLowerFirstLetter(workingGroup)

  await applyWorkingGroupsRemark(
    overlay,
    block,
    indexInBlock,
    extrinsicHash,
    workingGroupName as 'storageWorkingGroup' | 'distributionWorkingGroup',
    undefined,
    metadataBytes
  )
}

export async function processWorkingGroupsWorkerRemarkedEvent({
  overlay,
  block,
  event,
  indexInBlock,
  extrinsicHash,
  eventDecoder,
}: EventHandlerContext<
  'StorageWorkingGroup.WorkerRemarked' | 'DistributionWorkingGroup.WorkerRemarked'
>) {
  const [workerId, metadataBytes] = eventDecoder.v1000.decode(event)

  // Get the working group name
  const [workingGroup] = event.name.split('.')
  const workingGroupName = toLowerFirstLetter(workingGroup)

  await applyWorkingGroupsRemark(
    overlay,
    block,
    indexInBlock,
    extrinsicHash,
    workingGroupName as 'storageWorkingGroup' | 'distributionWorkingGroup',
    workerId,
    metadataBytes
  )
}

async function applyWorkingGroupsRemark(
  overlay: EntityManagerOverlay,
  block: Block,
  indexInBlock: number,
  extrinsicHash: string | undefined,
  workingGroup: 'storageWorkingGroup' | 'distributionWorkingGroup',
  workerId: bigint | undefined,
  metadataBytes: string
): Promise<void> {
  const metadata = deserializeMetadataStr(RemarkMetadataAction, metadataBytes)

  if (metadata?.setNodeOperationalStatus) {
    await processSetNodeOperationalStatusMessage(
      overlay,
      block,
      indexInBlock,
      extrinsicHash,
      workingGroup,
      workerId,
      metadata.setNodeOperationalStatus
    )
  } else {
    return invalidMetadata(RemarkMetadataAction, 'Unsupported remarked action')
  }
}
