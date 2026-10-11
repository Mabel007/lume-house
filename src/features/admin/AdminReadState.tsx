import { UiStatus } from '../../components/UiStatus';

export function AdminReadState({loading=false,message='',empty='',retry,retryLabel='Retry',disabled=false}:{loading?:boolean;message?:string;empty?:string;retry?:()=>void;retryLabel?:string;disabled?:boolean}) {
 if(loading)return <UiStatus kind="loading">{message || 'Loading records…'}</UiStatus>;
 if(message)return <UiStatus kind="error" action={retry&&<button type="button" className="button secondary" disabled={disabled} onClick={retry}>{retryLabel}</button>}>{message}</UiStatus>;
 return empty?<UiStatus kind="empty">{empty}</UiStatus>:null;
}
