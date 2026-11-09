import {retryHandler} from '../_shared/retry.ts';
Deno.serve(retryHandler());
