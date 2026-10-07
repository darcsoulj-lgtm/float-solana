import limits from '../../lib/market-snapshot-limits.json' with {type:'json'};
// One import batch per minute, plus publication/cache settling. Bounded even
// at maximum supported registry size; data freshness checks remain separate.
export function publicationAttempts(chunks){
 if(!Number.isSafeInteger(chunks)||chunks<1||chunks>limits.maxChunks)throw Error('Invalid publication chunk count');
 return Math.max(7,Math.ceil(chunks/limits.batchSize)+limits.settleTicks);
}
