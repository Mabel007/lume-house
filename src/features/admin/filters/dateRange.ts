export type RangeMode = 'date' | 'datetime';
export type DateRangeDraft = { mode: RangeMode; start: string; end: string };
export const periodNames = ['Today','Yesterday','Last 7 days','Last 14 days','This month','Last month','This quarter','Last quarter','This year','Last year','Custom range'] as const;
export type Period = typeof periodNames[number];
const day = 86400000;
function midnight(now: Date): number { return Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()); }
function month(year: number, index: number): number { return Date.UTC(year,index,1); }
export function periodRange(period: Period, mode: RangeMode, now = new Date()): DateRangeDraft {
 if(period==='Custom range') return {mode,start:'',end:''};
 const today=midnight(now), y=now.getUTCFullYear(), m=now.getUTCMonth(), q=Math.floor(m/3)*3;
 let start=today, end=today+day;
 switch(period){case 'Yesterday':start=today-day;end=today;break;case 'Last 7 days':start=today-6*day;break;case 'Last 14 days':start=today-13*day;break;case 'This month':start=month(y,m);break;case 'Last month':start=month(y,m-1);end=month(y,m);break;case 'This quarter':start=month(y,q);break;case 'Last quarter':start=month(y,q-3);end=month(y,q);break;case 'This year':start=month(y,0);break;case 'Last year':start=month(y-1,0);end=month(y,0);break;}
 if(mode==='datetime')return {mode,start:new Date(start).toISOString().slice(0,19),end:new Date(Math.min(end,now.getTime())).toISOString().slice(0,19)};
 return {mode,start:new Date(start).toISOString().slice(0,10),end:new Date(end-day).toISOString().slice(0,10)};
}
function instant(value: string, mode: RangeMode): number {
 const pattern=mode==='date'?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;
 if(!pattern.test(value))throw new Error('Enter a valid date and time.');
 const iso=mode==='date'?`${value}T00:00:00.000Z`:`${value.length===16?value+':00':value}.000Z`;
 const time=Date.parse(iso);
 if(!Number.isFinite(time)||new Date(time).toISOString()!==iso)throw new Error('Enter a valid calendar date and time.');
 return time;
}
export function normalizeDateRange(draft: DateRangeDraft, now = new Date(), maxDays?: number): {from:string;to:string}|null {
 if(!draft.start&&!draft.end)return null;
 if(!draft.start||!draft.end)throw new Error('Choose both a start and an end.');
 const start=instant(draft.start,draft.mode), end=instant(draft.end,draft.mode)+(draft.mode==='date'?day:0);
 if(end<=start)throw new Error('The end must be after the start.');
 if(end>(draft.mode==='date'?midnight(now)+day:now.getTime()))throw new Error('Future dates are not available for this report.');
 if(maxDays&&end-start>maxDays*day)throw new Error(`Choose a range of ${maxDays} days or less.`);
 return {from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}
export function draftFromInterval(from:string,to:string,mode:RangeMode='datetime'):DateRangeDraft {
 if(!from&&!to)return {mode,start:'',end:''};
 return {mode,start:from.slice(0,mode==='date'?10:19),end:mode==='date'?new Date(Date.parse(to)-day).toISOString().slice(0,10):to.slice(0,19)};
}
