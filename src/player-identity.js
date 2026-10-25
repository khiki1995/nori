// Show the signed-in player's identity in the shared header on every screen.
(function(){'use strict'; const el=document.getElementById('playerIdentity'); if(!el)return;
function paint(name,avatar){el.replaceChildren();if(avatar){const img=document.createElement('img');img.src=avatar;img.alt='';el.append(img);}const span=document.createElement('span');span.textContent=name||'Guest';el.append(span);el.title=name?'Player profile':'Signed out';}
async function load(){let token='';try{token=localStorage.getItem('nori.account.token.v1')||'';}catch(_){} if(!token){paint('Guest','');return;}try{const r=await fetch('/api/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const d=await r.json();if(r.ok&&d.ok&&d.user)paint(d.user.username,d.user.avatar);else paint('Guest','');}catch(_){paint('Guest','');}}
window.addEventListener('storage',e=>{if(e.key==='nori.account.token.v1')load();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();
})();
