import { decodeFunctionData, getAddress, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  encodeCreateGift,
  encodeContribute,
  holdsakeFundsAbi,
  holdsakeGiftsAbi,
  USDG,
} from '../src'

const bob = getAddress('0x000000000000000000000000000000000000b0b0')
const tsla = getAddress('0x0000000000000000000000000000000000007e51')

describe('encoders', () => {
  it('createGift round-trips through the generated ABI', () => {
    const items = [
      { token: tsla, amount: 2n * 10n ** 18n },
      { token: USDG, amount: 25n * 10n ** 18n },
    ] as const
    const data = encodeCreateGift(bob, items)
    expect(data.slice(0, 10)).toBe(toFunctionSelector('createGift(address,(address,uint256)[])'))
    const decoded = decodeFunctionData({ abi: holdsakeGiftsAbi, data })
    expect(decoded.functionName).toBe('createGift')
    expect(decoded.args).toEqual([bob, items])
  })

  it('contribute round-trips', () => {
    const data = encodeContribute(1n, tsla, 5n)
    const decoded = decodeFunctionData({ abi: holdsakeFundsAbi, data })
    expect(decoded.functionName).toBe('contribute')
    expect(decoded.args).toEqual([1n, tsla, 5n])
  })
})
