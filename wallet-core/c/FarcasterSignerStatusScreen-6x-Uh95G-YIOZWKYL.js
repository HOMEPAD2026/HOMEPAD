import{a as j}from"./chunk-GMP3Y2ZW.js";import{a as O}from"./chunk-YYDOQMK6.js";import{a as g}from"./chunk-FKBVDVBP.js";import{a as I}from"./chunk-56XV5TRB.js";import"./chunk-L45IV3XN.js";import{a as T}from"./chunk-2PYO35UV.js";import"./chunk-VG2EN6VN.js";import"./chunk-4MPVWZRJ.js";import"./chunk-WD4LMZ7H.js";import{b as C}from"./chunk-OYJ7PEXE.js";import{b as o,f as F}from"./chunk-FSRHYL3M.js";import{a as N}from"./chunk-7PKRG2GC.js";import"./chunk-APDHX25N.js";import"./chunk-TDMVJVJK.js";import"./chunk-FY6AQC7U.js";import"./chunk-HVUTLKM4.js";import{Aa as S,Qa as w,ub as b}from"./chunk-RV2BVV5E.js";import"./chunk-TA4XJX63.js";import"./chunk-T3YWFXU7.js";import{a as M,b as E}from"./chunk-GEBSL4PL.js";import"./chunk-T5DLQ6Z2.js";import"./chunk-LSMYL5KC.js";import"./chunk-SIS7NNHK.js";import"./chunk-3BVVOQRY.js";import{f as y}from"./chunk-A2A4QY5Z.js";var e=y(E(),1),r=y(M(),1),d=y(N(),1);var q="#8a63d2",P=({appName:m,loading:f,success:u,errorMessage:a,connectUri:t,onBack:s,onClose:n,onOpenFarcaster:i})=>(0,e.jsx)(T,d.isMobile||f?d.isIOS?{title:a?a.message:"Add a signer to Farcaster",subtitle:a?a.detail:`This will allow ${m} to add casts, likes, follows, and more on your behalf.`,icon:g,iconVariant:"loading",iconLoadingStatus:{success:u,fail:!!a},primaryCta:t&&i?{label:"Open Farcaster app",onClick:i}:void 0,onBack:s,onClose:n,watermark:!0}:{title:a?a.message:"Requesting signer from Farcaster",subtitle:a?a.detail:"This should only take a moment",icon:g,iconVariant:"loading",iconLoadingStatus:{success:u,fail:!!a},onBack:s,onClose:n,watermark:!0,children:t&&d.isMobile&&(0,e.jsx)(R,{children:(0,e.jsx)(O,{text:"Take me to Farcaster",url:t,color:q})})}:{title:"Add a signer to Farcaster",subtitle:`This will allow ${m} to add casts, likes, follows, and more on your behalf.`,onBack:s,onClose:n,watermark:!0,children:(0,e.jsxs)(V,{children:[(0,e.jsx)(z,{children:t?(0,e.jsx)(I,{url:t,size:275,squareLogoElement:g}):(0,e.jsx)(U,{children:(0,e.jsx)(F,{})})}),(0,e.jsxs)(D,{children:[(0,e.jsx)(Q,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),t&&(0,e.jsx)(j,{text:t,itemName:"link",color:q})]})]})}),R=o.div`
  margin-top: 24px;
`,V=o.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,z=o.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,D=o.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,Q=o.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,U=o.div`
  position: relative;
  width: 82px;
  height: 82px;
`,ae={component:()=>{let{lastScreen:m,navigateBack:f,data:u}=C(),a=b(),{requestFarcasterSignerStatus:t,closePrivyModal:s}=S(),[n,i]=(0,r.useState)(void 0),[B,k]=(0,r.useState)(!1),[_,x]=(0,r.useState)(!1),h=(0,r.useRef)([]),c=u?.farcasterSigner;(0,r.useEffect)((()=>{let A=Date.now(),l=setInterval((async()=>{if(!c?.public_key)return clearInterval(l),void i({retryable:!0,message:"Connect failed",detail:"Something went wrong. Please try again."});c.status==="approved"&&(clearInterval(l),k(!1),x(!0),h.current.push(setTimeout((()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w)));let p=await t(c?.public_key),L=Date.now()-A;p.status==="approved"?(clearInterval(l),k(!1),x(!0),h.current.push(setTimeout((()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w))):L>3e5?(clearInterval(l),i({retryable:!0,message:"Connect failed",detail:"The request timed out. Try again."})):p.status==="revoked"&&(clearInterval(l),i({retryable:!0,message:"Request rejected",detail:"The request was rejected. Please try again."}))}),2e3);return()=>{clearInterval(l),h.current.forEach((p=>clearTimeout(p)))}}),[]);let v=c?.status==="pending_approval"?c.signer_approval_url:void 0;return(0,e.jsx)(P,{appName:a.name,loading:B,success:_,errorMessage:n,connectUri:v,onBack:m?f:void 0,onClose:s,onOpenFarcaster:()=>{v&&(window.location.href=v)}})}};export{ae as FarcasterSignerStatusScreen,P as FarcasterSignerStatusView,ae as default};
