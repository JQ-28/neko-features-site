import type { Feature } from '../types';
import { crazyThursday } from './crazy-thursday/route';
import { stereotypes } from './stereotypes/route';
import { sayoroll } from './sayoroll/route';
import { removeBg } from './remove-bg/route';
import { imageSearch } from './image-search/route';
import { mangaTranslator } from './manga-translator/route';
import { parser } from './parser/route';
import { bing } from './bing/route';
import { health } from './health/route';
import { daily } from './daily/route';
import { rollpig } from './rollpig/route';
import { doro } from './doro/route';

export const FEATURES: Feature[] = [
  crazyThursday,
  stereotypes,
  sayoroll,
  mangaTranslator,
  parser,
  removeBg,
  imageSearch,
  bing,
  health,
  daily,
  rollpig,
  doro,
];
