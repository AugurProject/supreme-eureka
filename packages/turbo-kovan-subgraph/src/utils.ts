import { Address, BigInt, Bytes, crypto } from "@graphprotocol/graph-ts";

let ZERO = new BigInt(0);

function upperCase(s: string): string {
  const letterMap = new Map<string, string>();
  letterMap.set("a", "A");
  letterMap.set("b", "B");
  letterMap.set("c", "C");
  letterMap.set("d", "D");
  letterMap.set("e", "E");
  letterMap.set("f", "F");

  const r = new Array<string>();
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
  const ret = originalAddress.toHexString().split("").slice(2);
  const addressToHash = Bytes.fromUTF8(ret.join(""));
  const hashed = crypto.keccak256(addressToHash).toHexString().split("").slice(2);
  for (let i = 0; i < ret.length; i += 1) {
    if (Number.parseInt(hashed[i], 16) >= 8) {
      ret[i] = upperCase(ret[i]);
    }
  }
  return "0x" + ret.join("");
}

export function mapAddressArray(arr: Address[]): string[] {
  const result = new Array<string>();
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
  const result = new Array<string>();
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i].toHexString());
  }

  return result;
}

export function mapArray(arr: BigInt[]): string[] {
  const result = new Array<string>();
  for (let i = 0; i < arr.length; i++) {
    result.push(bigIntToHexString(arr[i]));
  }

  return result;
}
