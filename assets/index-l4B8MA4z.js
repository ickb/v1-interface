(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))u(e);new MutationObserver(e=>{for(const r of e)if(r.type==="childList")for(const t of r.addedNodes)t.tagName==="LINK"&&t.rel==="modulepreload"&&u(t)}).observe(document,{childList:!0,subtree:!0});function c(e){const r={};return e.integrity&&(r.integrity=e.integrity),e.referrerPolicy&&(r.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?r.credentials="include":e.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function u(e){if(e.ep)return;e.ep=!0;const r=c(e);fetch(e.href,r)}})();const y="modulepreload",g=function(l){return"/v1-interface/"+l},d={},E=function(i,c,u){let e=Promise.resolve();if(c&&c.length>0){document.getElementsByTagName("link");const t=document.querySelector("meta[property=csp-nonce]"),o=(t==null?void 0:t.nonce)||(t==null?void 0:t.getAttribute("nonce"));e=Promise.allSettled(c.map(n=>{if(n=g(n),n in d)return;d[n]=!0;const a=n.endsWith(".css"),m=a?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${n}"]${m}`))return;const s=document.createElement("link");if(s.rel=a?"stylesheet":y,a||(s.as="script"),s.crossOrigin="",s.href=n,o&&s.setAttribute("nonce",o),document.head.appendChild(s),a)return new Promise((p,h)=>{s.addEventListener("load",p),s.addEventListener("error",()=>h(new Error(`Unable to preload CSS for ${n}`)))})}))}function r(t){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=t,window.dispatchEvent(o),!o.defaultPrevented)throw t}return e.then(t=>{for(const o of t||[])o.status==="rejected"&&r(o.reason);return i().catch(r)})},f=document.getElementsByTagName("button"),v=document.getElementById("progress"),b=E(()=>import("./main-0B5nl9GM.js"),[]);for(const l of f)l.addEventListener("click",async i=>{for(const u of f)u.disabled=!0;v.classList.replace("hidden","flex");const{startApp:c}=await b;c(i.target.id)},!1);