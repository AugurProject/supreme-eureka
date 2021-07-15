import { Address, BigDecimal, BigInt, Bytes, crypto } from "@graphprotocol/graph-ts";

let ZERO = BigInt.fromI32(0);

export let SHARES_DECIMALS = BigInt.fromI32(10 ).pow(18).toBigDecimal();
export let USDC_DECIMALS = BigInt.fromI32(10 ).pow(6).toBigDecimal();
export let DUST_POSITION_AMOUNT_BIG_DECIMAL = BigDecimal.fromString("0.0001");
export let DUST_POSITION_AMOUNT_BIG_INT = BigInt.fromI32(1);

function upperCase(s: string): string {
  let letterMap = new Map<string, string>();
  letterMap.set("a", "A");
  letterMap.set("b", "B");
  letterMap.set("c", "C");
  letterMap.set("d", "D");
  letterMap.set("e", "E");
  letterMap.set("f", "F");

  let r = new Array<string>();
  for (let i = 0; i < s.length; i++) {
    if (letterMap.has(s[i])) {
      r[i] = letterMap.get(s[i]);
    } else {
      r[i] = s[i];
    }
  }

  return r.join("");
}

export function toChecksumAddress(originalAddress: Address): string {
  let ret = originalAddress.toHexString().split("").slice(2);
  let addressToHash = Bytes.fromUTF8(ret.join(""));
  let hashed = crypto.keccak256(addressToHash).toHexString().split("").slice(2);
  for (let i = 0; i < ret.length; i += 1) {
    if (Number.parseInt(hashed[i], 16) >= 8) {
      ret[i] = upperCase(ret[i]);
    }
  }
  return "0x" + ret.join("");
}

export function mapAddressArray(arr: Address[]): string[] {
  let result = new Array<string>();
  for (let i = 0; i < arr.length; i++) {
    result.push(toChecksumAddress(arr[i]));
  }

  return result;
}

export function bigIntToHexString(bigint: BigInt): string {
  let hexString = bigint.toHexString().split("").slice(2);
  if (hexString.length == 1) {
    hexString.unshift("0");
  }
  hexString.unshift("0x");

  if (bigint.lt(ZERO)) {
    hexString.unshift("-");
  }
  return hexString.join("");
}

export function mapByteArray(arr: Bytes[]): string[] {
  let result = new Array<string>();
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i].toHexString());
  }

  return result;
}

export function mapArray(arr: BigInt[]): string[] {
  let result = new Array<string>();
  for (let i = 0; i < arr.length; i++) {
    result.push(bigIntToHexString(arr[i]));
  }

  return result;
}
