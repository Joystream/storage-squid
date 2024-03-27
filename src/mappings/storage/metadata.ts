import {
  GeographicalArea as GeographicalAreaProto,
  IDistributionBucketFamilyMetadata,
  IDistributionBucketOperatorMetadata,
  IGeographicalArea,
  INodeLocationMetadata,
  INodeOperationalStatus,
  IStorageBucketOperatorMetadata,
  NodeOperationalStatusNoServiceFrom as NodeOperationalStatusNoServiceFromMetadata,
  NodeOperationalStatusNoServiceUntil as NodeOperationalStatusNoServiceUntilMetadata,
} from '@joystream/metadata-protobuf'
import { DecodedMetadataObject } from '@joystream/metadata-protobuf/types'
import {
  isEmptyObject,
  isSet,
  isValidCountryCode,
  isValidSubdivisionCode,
} from '@joystream/metadata-protobuf/utils'
import _ from 'lodash'
import { Logger } from '../../logger'
import {
  Continent,
  DistributionBucketFamilyMetadata,
  DistributionBucketOperatorMetadata,
  GeoCoordinates,
  GeographicalArea,
  GeographicalAreaContinent,
  GeographicalAreaCountry,
  GeographicalAreaSubdivistion,
  NodeLocationMetadata,
  NodeOperationalStatus,
  NodeOperationalStatusNoService,
  NodeOperationalStatusNoServiceFrom,
  NodeOperationalStatusNoServiceUntil,
  NodeOperationalStatusNormal,
  StorageBucketOperatorMetadata,
} from '../../model'
import { EntityManagerOverlay, Flat } from '../../utils/overlay'
import { invalidMetadata, parseDateStr } from '../utils'

export const protobufContinentToGraphlContinent: {
  [key in GeographicalAreaProto.Continent]: Continent
} = {
  [GeographicalAreaProto.Continent.AF]: Continent.AF,
  [GeographicalAreaProto.Continent.AN]: Continent.AN,
  [GeographicalAreaProto.Continent.AS]: Continent.AS,
  [GeographicalAreaProto.Continent.EU]: Continent.EU,
  [GeographicalAreaProto.Continent.NA]: Continent.NA,
  [GeographicalAreaProto.Continent.OC]: Continent.OC,
  [GeographicalAreaProto.Continent.SA]: Continent.SA,
}

export async function processStorageOperatorMetadata(
  overlay: EntityManagerOverlay,
  bucketId: string,
  metadataUpdate: DecodedMetadataObject<IStorageBucketOperatorMetadata>
) {
  const metadataRepository = overlay.getRepository(StorageBucketOperatorMetadata)
  const operatorMetadata =
    (await metadataRepository.getById(bucketId)) ||
    metadataRepository.new({
      id: bucketId,
      storageBucketId: bucketId,
    })
  if (isSet(metadataUpdate.endpoint)) {
    operatorMetadata.nodeEndpoint = metadataUpdate.endpoint || null
  }
  if (isSet(metadataUpdate.location)) {
    processNodeLocationMetadata(operatorMetadata, metadataUpdate.location)
  }
  if (isSet(metadataUpdate.operationalStatus)) {
    operatorMetadata.nodeOperationalStatus = processNodeOperationalStatusMetadata(
      'worker',
      operatorMetadata.nodeOperationalStatus,
      metadataUpdate.operationalStatus
    )
  }
  if (isSet(metadataUpdate.extra)) {
    operatorMetadata.extra = metadataUpdate.extra || null
  }
}

function processNodeLocationMetadata(
  parent: Flat<StorageBucketOperatorMetadata> | Flat<DistributionBucketOperatorMetadata>,
  metadataUpdate: DecodedMetadataObject<INodeLocationMetadata>
) {
  if (isEmptyObject(metadataUpdate)) {
    parent.nodeLocation = null
    return
  }
  const nodeLocationMetadata = parent.nodeLocation || new NodeLocationMetadata()
  parent.nodeLocation = nodeLocationMetadata
  if (isSet(metadataUpdate.city)) {
    nodeLocationMetadata.city = metadataUpdate.city
  }
  if (isSet(metadataUpdate.coordinates)) {
    if (isEmptyObject(metadataUpdate.coordinates)) {
      nodeLocationMetadata.coordinates = null
    } else {
      if (!nodeLocationMetadata.coordinates) {
        nodeLocationMetadata.coordinates = new GeoCoordinates()
      }
      if (isSet(metadataUpdate.coordinates.latitude)) {
        nodeLocationMetadata.coordinates.latitude = metadataUpdate.coordinates.latitude
      }
      if (isSet(metadataUpdate.coordinates.longitude)) {
        nodeLocationMetadata.coordinates.longitude = metadataUpdate.coordinates.longitude
      }
    }
  }
  if (isSet(metadataUpdate.countryCode)) {
    if (isValidCountryCode(metadataUpdate.countryCode)) {
      nodeLocationMetadata.countryCode = metadataUpdate.countryCode
    } else {
      Logger.get().warn(`Invalid country code: ${metadataUpdate.countryCode}`)
      nodeLocationMetadata.countryCode = null
    }
  }
}

export function processNodeOperationalStatusMetadata(
  actorContext: 'lead' | 'worker',
  currentStatus: NodeOperationalStatus | null | undefined,
  meta: INodeOperationalStatus
): NodeOperationalStatus | null | undefined {
  const isCurrentStatusForced =
    currentStatus &&
    (currentStatus instanceof NodeOperationalStatusNoService ||
      currentStatus instanceof NodeOperationalStatusNoServiceFrom ||
      currentStatus instanceof NodeOperationalStatusNoServiceUntil) &&
    currentStatus.forced

  // if current state is forced by lead, then prevent worker from unilaterally reversing.
  if (isCurrentStatusForced && actorContext === 'worker') {
    return currentStatus
  }

  // For status type Normal
  if (meta.normal) {
    const status = new NodeOperationalStatusNormal()
    status.rationale = meta.normal.rationale
    return status
  }
  // For status type NoService
  else if (meta.noService) {
    const status = new NodeOperationalStatusNoService()
    status.rationale = meta.noService.rationale
    status.forced = actorContext === 'lead'
    return status
  }
  // For status type NoServiceFrom
  else if (meta.noServiceFrom) {
    const from = parseDateStr(meta.noServiceFrom.from)

    // Date must be in the future
    if (!from || from < new Date()) {
      invalidMetadata(
        NodeOperationalStatusNoServiceFromMetadata,
        `Invalid date for "noServiceFrom"`,
        { decodedMessage: meta.noServiceFrom }
      )
      return currentStatus
    }

    const status = new NodeOperationalStatusNoServiceFrom()
    status.rationale = meta.noServiceFrom.rationale
    status.forced = actorContext === 'lead'
    status.from = from
    return status
  }
  // For status type NoServiceUntil
  else if (meta.noServiceUntil) {
    const from = meta.noServiceUntil.from ? parseDateStr(meta.noServiceUntil.from) : new Date()
    const until = parseDateStr(meta.noServiceUntil.until)

    // Dates must be in the future and "until" must be after "from"
    if (!from || !until || from < new Date() || from > until) {
      invalidMetadata(
        NodeOperationalStatusNoServiceUntilMetadata,
        `Invalid date/s for "noServiceUntil"`,
        { decodedMessage: meta.noServiceUntil }
      )
      return currentStatus
    }
    const status = new NodeOperationalStatusNoServiceUntil()
    status.rationale = meta.noServiceUntil.rationale
    status.forced = actorContext === 'lead'
    status.from = from
    status.until = until
    return status
  }
}

export async function processDistributionOperatorMetadata(
  overlay: EntityManagerOverlay,
  operatorId: string,
  metadataUpdate: DecodedMetadataObject<IDistributionBucketOperatorMetadata>
): Promise<void> {
  const metadataRepository = overlay.getRepository(DistributionBucketOperatorMetadata)
  const operatorMetadata =
    (await metadataRepository.getById(operatorId)) ||
    metadataRepository.new({
      id: operatorId,
      distirbutionBucketOperatorId: operatorId,
    })
  if (isSet(metadataUpdate.endpoint)) {
    operatorMetadata.nodeEndpoint = metadataUpdate.endpoint || null
  }
  if (isSet(metadataUpdate.location)) {
    processNodeLocationMetadata(operatorMetadata, metadataUpdate.location)
  }
  if (isSet(metadataUpdate.operationalStatus)) {
    operatorMetadata.nodeOperationalStatus = processNodeOperationalStatusMetadata(
      'worker',
      operatorMetadata.nodeOperationalStatus,
      metadataUpdate.operationalStatus
    )
  }
  if (isSet(metadataUpdate.extra)) {
    operatorMetadata.extra = metadataUpdate.extra || null
  }
}

export async function processDistributionBucketFamilyMetadata(
  overlay: EntityManagerOverlay,
  familyId: string,
  metadataUpdate: DecodedMetadataObject<IDistributionBucketFamilyMetadata>
): Promise<void> {
  const metadataRepository = overlay.getRepository(DistributionBucketFamilyMetadata)
  const familyMetadata =
    (await metadataRepository.getById(familyId)) ||
    metadataRepository.new({ id: familyId, familyId })
  if (isSet(metadataUpdate.region)) {
    familyMetadata.region = metadataUpdate.region || null
  }
  if (isSet(metadataUpdate.description)) {
    familyMetadata.description = metadataUpdate.description || null
  }
  if (isSet(metadataUpdate.latencyTestTargets)) {
    familyMetadata.latencyTestTargets = metadataUpdate.latencyTestTargets.filter((t) => t)
  }
  if (isSet(metadataUpdate.areas)) {
    // Set new areas
    familyMetadata.areas = _.chain(metadataUpdate.areas)
      .filter((a) => !isEmptyObject(a))
      .uniqWith(_.isEqual)
      .flatMap((a: DecodedMetadataObject<IGeographicalArea>): Array<GeographicalArea> => {
        if (a.continent) {
          const continentCode = protobufContinentToGraphlContinent[a.continent]
          if (!continentCode) {
            invalidMetadata(
              GeographicalAreaProto,
              `Unrecognized continent enum variant: ${a.continent}`,
              { decodedMessage: a }
            )
            return []
          }
          return [
            new GeographicalAreaContinent({
              continentCode,
            }),
          ]
        }

        if (a.countryCode) {
          if (!isValidCountryCode(a.countryCode)) {
            invalidMetadata(GeographicalAreaProto, `Invalid country code: ${a.countryCode}`, {
              decodedMessage: a,
            })
            return []
          }
          return [
            new GeographicalAreaCountry({
              countryCode: a.countryCode,
            }),
          ]
        }

        if (a.subdivisionCode) {
          if (!isValidSubdivisionCode(a.subdivisionCode)) {
            invalidMetadata(
              GeographicalAreaProto,
              `Invalid subdivision code: ${a.subdivisionCode}`,
              {
                decodedMessage: a,
              }
            )
            return []
          }
          return [new GeographicalAreaSubdivistion({ subdivisionCode: a.subdivisionCode })]
        }

        return []
      })
      .value()
  }
}
