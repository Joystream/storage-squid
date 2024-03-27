import { AnyMetadataClass, DecodedMetadataObject } from '@joystream/metadata-protobuf/types'
import { metaToObject } from '@joystream/metadata-protobuf/utils'
import { createType } from '@joystream/types'
import { Bytes } from '@polkadot/types/primitive'
import { hexToU8a, u8aToHex } from '@polkadot/util'
import { encodeAddress } from '@polkadot/util-crypto'
import { Logger } from '../logger'
import { Event, MetaprotocolTransactionResultFailed } from '../model'
import { Block } from '../processor'
import { EntityManagerOverlay } from '../utils/overlay'

export const JOYSTREAM_SS58_PREFIX = 126

export function bytesToString(b: Uint8Array): string {
  return Buffer.from(b).toString()
}

export function deserializeMetadata<T>(
  metadataType: AnyMetadataClass<T>,
  metadataBytes: Uint8Array,
  opts = {
    skipWarning: false,
  }
): DecodedMetadataObject<T> | null {
  Logger.get().debug(
    `Trying to deserialize ${Buffer.from(metadataBytes).toString('hex')} as ${metadataType.name}...`
  )
  try {
    const message = metadataType.decode(metadataBytes)
    return metaToObject(metadataType, message)
  } catch (e) {
    if (!opts.skipWarning) {
      invalidMetadata(metadataType, 'Could not decode the input ', {
        encodedMessage: Buffer.from(metadataBytes).toString('hex'),
      })
    }
    return null
  }
}

export function deserializeMetadataStr<T>(
  metadataType: AnyMetadataClass<T>,
  metadataBytesStr: string | undefined,
  opts = {
    skipWarning: false,
  }
): DecodedMetadataObject<T> | undefined | null {
  if (!metadataBytesStr) {
    return undefined
  }

  const metadataBytes = hexToU8a(metadataBytesStr)
  return deserializeMetadata(metadataType, metadataBytes, opts)
}

export type InvalidMetadataExtra<T> = {
  encodedMessage?: string
  decodedMessage?: DecodedMetadataObject<T>
  [K: string]: unknown
}

export function invalidMetadata<T>(
  type: AnyMetadataClass<T>,
  message: string,
  data?: InvalidMetadataExtra<T>
): void {
  Logger.get().warn(`Invalid metadata (${type.name}): ${message}`, { ...data, type })
}

export function genericEventFields(
  overlay: EntityManagerOverlay,
  block: Block,
  indexInBlock: number,
  txHash?: string
): Partial<Event> {
  return {
    id: overlay.getRepository(Event).getNewEntityId(),
    inBlock: block.height,
    indexInBlock,
    timestamp: new Date(block.timestamp || ''),
    inExtrinsic: txHash,
  }
}

export function toAddress(addressBytes: Uint8Array) {
  return encodeAddress(addressBytes, JOYSTREAM_SS58_PREFIX)
}

export function metaprotocolTransactionFailure<T>(
  metaClass: AnyMetadataClass<T>,
  message: string,
  data?: InvalidMetadataExtra<T>
): MetaprotocolTransactionResultFailed {
  invalidMetadata(metaClass, message, data)
  return new MetaprotocolTransactionResultFailed({
    errorMessage: message,
  })
}

export function backwardCompatibleMetaID(block: Block, indexInBlock: number) {
  return `METAPROTOCOL-OLYMPIA-${block.height}-${indexInBlock}`
}

export function u8aToBytes(array?: Uint8Array | null): Bytes {
  return createType('Bytes', array ? u8aToHex(array) : '')
}

export function toLowerFirstLetter(str: string) {
  if (!str) return '' // Return an empty string if str is falsy
  return str.charAt(0).toLowerCase() + str.slice(1)
}

export function parseDateStr(date: string): Date | undefined {
  try {
    if (date) {
      const dateObj = new Date(date)
      dateObj.toISOString() // Throws an error if the date is invalid
      return dateObj
    }
  } catch (error) {
    console.error(`Invalid date format:`, date)
  }
}
