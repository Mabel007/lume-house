export function AdminReadState({loading=false,message='',empty='',retry,retryLabel='Retry',disabled=false}:{loading?:boolean;message?:string;empty?:string;retry?:()=>void;retryLabel?:string;disabled?:boolean}) {
 if(loading)return <p className="admin-read-state" role="status">{message}</p>;
 if(message)return <p className="admin-read-state" role="alert">{message}{retry&&<> <button type="button" disabled={disabled} onClick={retry}>{retryLabel}</button></>}</p>;
 return empty?<p className="admin-read-state">{empty}</p>:null;
}
