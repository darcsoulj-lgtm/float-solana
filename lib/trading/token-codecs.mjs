import { PublicKey } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS, getTokenDecoder, getMintDecoder } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS, getTokenDecoder as getToken2022Decoder, getMintDecoder as getMint2022Decoder } from '@solana-program/token-2022';

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
export const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ADDRESS);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(TOKEN_2022_PROGRAM_ADDRESS);
const tokenDecoder = getTokenDecoder(), mintDecoder = getMintDecoder();
const token2022Decoder = getToken2022Decoder(), mint2022Decoder = getMint2022Decoder();
const option = (value) => value.__option === 'Some' ? value.value : null;
const optionKey = (value) => option(value) == null ? null : new PublicKey(option(value));

// Standard ATA seed derivation; binary account parsing is exclusively through
// official generated Solana program codecs, never a locally implemented layout.
export function getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve = false, program = TOKEN_PROGRAM_ID) {
  if (!allowOwnerOffCurve && !PublicKey.isOnCurve(owner.toBytes())) throw Error('Token owner is off curve.');
  return PublicKey.findProgramAddressSync([owner.toBuffer(), program.toBuffer(), mint.toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID)[0];
}
function is2022(info, expectedProgram) {
  if (!info || !info.owner.equals(expectedProgram) || info.executable) throw Error('Invalid token account owner.');
  if (expectedProgram.equals(TOKEN_2022_PROGRAM_ID)) return true;
  if (!expectedProgram.equals(TOKEN_PROGRAM_ID)) throw Error('Unsupported token program.');
  return false;
}
export function unpackAccount(address, info, expectedProgram = TOKEN_PROGRAM_ID) {
  const extended = is2022(info, expectedProgram);
  if (!extended && info.data.length !== tokenDecoder.fixedSize) throw Error('Invalid legacy token account size.');
  const decoder = extended ? token2022Decoder : tokenDecoder;
  const [decoded, offset] = decoder.read(info.data, 0);
  if (offset !== info.data.length || ![1, 2].includes(decoded.state)) throw Error('Invalid token account state or trailing data.');
  return { address, mint: new PublicKey(decoded.mint), owner: new PublicKey(decoded.owner), amount: decoded.amount,
    delegate: optionKey(decoded.delegate), delegatedAmount: decoded.delegatedAmount, closeAuthority: optionKey(decoded.closeAuthority),
    isFrozen: decoded.state === 2, isNative: option(decoded.isNative) != null,
    // Preserve the complete extension bytes, including discriminator and unused
    // padding, to conservatively detect any pre/post extension mutation.
    tlvData: extended ? Buffer.from(info.data.subarray(tokenDecoder.fixedSize)) : Buffer.alloc(0),
    extensions: extended ? option(decoded.extensions) || [] : [] };
}
export function unpackMint(_address, info, expectedProgram = TOKEN_PROGRAM_ID) {
  const extended = is2022(info, expectedProgram);
  if (!extended && info.data.length !== mintDecoder.fixedSize) throw Error('Invalid legacy mint size.');
  const decoder = extended ? mint2022Decoder : mintDecoder;
  const [decoded, offset] = decoder.read(info.data, 0);
  if (offset !== info.data.length) throw Error('Unexpected mint trailing data.');
  return decoded;
}
