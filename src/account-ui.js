// Account and profile screen. Bot selection lives under Tasks -> Bot catalog.
(function () {
'use strict';
const N = NORI, I = I18N, U = N.ui, el = U.el, root = () => document.getElementById('screenProfile');
const t = k => I.t('acc_' + k);   // strings live in i18n.js under the acc_ prefix
let token = '', user = null, notice = '', noticeKind = 'neutral', busy = false, apiState = 'unknown', loaded = false, googleReady = false;
try { token = localStorage.getItem('nori.account.token.v1') || ''; } catch (_) {}
const text = x => String(x == null ? '' : x);
const api = async (url, method='GET', body=null, auth=true) => {
 const headers = { Accept:'application/json' }; if (body !== null) headers['Content-Type']='application/json'; if (auth && token) headers.Authorization='Bearer '+token;
 let res, data; try { res=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'}); data=await res.json(); }
 catch (_) { apiState='offline'; throw Object.assign(new Error(t('offline')),{code:'OFFLINE'}); }
 if (!res.ok || !data || data.ok !== true) throw Object.assign(new Error(messageFor(data && data.code)),{code:data && data.code || 'REQUEST_FAILED'});
 apiState='ready'; return data;
};
function messageFor(code) { return ({INVALID_EMAIL:t('badEmail'),WEAK_PASSWORD:t('badPass'),INVALID_USERNAME:t('badName'),EMAIL_EXISTS:t('exists'),USERNAME_EXISTS:t('nameTaken'),INVALID_CREDENTIALS:t('credentials'),INVALID_BIO:t('bioLimit'),UNAUTHENTICATED:t('offline'),INVALID_AVATAR:t('avatarRead'),GOOGLE_EMAIL_EXISTS:t('googleEmailExists'),RATE_LIMITED:t('rateLimited')})[code] || t('generic'); }
function setNotice(msg, kind='neutral') { notice=msg; noticeKind=kind; }
function persistToken(value) { token=value||''; try { if(token)localStorage.setItem('nori.account.token.v1',token); else localStorage.removeItem('nori.account.token.v1'); } catch (_) {} }
function field(label,type,name,opts={}) { const input=el('input',{type,name,required:!!opts.required,minlength:opts.minlength||false,maxlength:opts.maxlength||false,autocomplete:opts.autocomplete||false,placeholder:opts.placeholder||'',value:opts.value||''}); return {node:el('label',{class:'account-field'},[el('span',{},label),input]),input}; }
function messageNode() { return notice ? el('p',{class:'account-notice '+noticeKind,role:'status'},notice) : null; }
function stat(label,value) { return el('div',{class:'account-stat'},[el('span',{},label),el('strong',{},text(value))]); }
function avatarNode(src,name,large=false) { const wrap=el('div',{class:'account-avatar'+(large?' account-avatar-large':'')}); if(src) wrap.append(el('img',{alt:name||'NORI avatar',src})); else wrap.append(el('span',{'aria-hidden':'true'},(name||'N').trim().slice(0,1).toUpperCase()||'N')); return wrap; }
function googleButton() { return el('button',{type:'button',class:'google-button',disabled:!googleReady,onclick:()=>{if(googleReady)location.href='/auth/google';else setNotice(t('googleMissing'),'bad');render();}},[el('span',{class:'google-mark','aria-hidden':'true'},'G'),t('google')]); }
function authPanel() {
 const le=field(t('email'),'email','email',{required:true,autocomplete:'email'}), lp=field(t('password'),'password','password',{required:true,autocomplete:'current-password'});
 const re=field(t('email'),'email','email',{required:true,autocomplete:'email'}), rn=field(t('username'),'text','username',{required:true,minlength:3,maxlength:20,autocomplete:'nickname'}), rp=field(t('password'),'password','password',{required:true,minlength:10,autocomplete:'new-password'});
 const signin=el('form',{class:'account-form',onsubmit:async e=>{e.preventDefault();if(busy)return;busy=true;setNotice(t('loading'));render();try{const d=await api('/api/login','POST',{email:le.input.value,password:lp.input.value},false);persistToken(d.token);user=d.user;setNotice(t('loggedIn'),'good');}catch(err){setNotice(err.message,'bad');}finally{busy=false;render();}}},[el('h3',{},t('login')),le.node,lp.node,el('button',{type:'submit',class:'primary',disabled:busy},t('login'))]);
 const register=el('form',{class:'account-form',onsubmit:async e=>{e.preventDefault();if(busy)return;busy=true;setNotice(t('loading'));render();try{const d=await api('/api/register','POST',{email:re.input.value,password:rp.input.value,username:rn.input.value},false);persistToken(d.token);user=d.user;setNotice(t('registered'),'good');}catch(err){setNotice(err.message,'bad');}finally{busy=false;render();}}},[el('h3',{},t('register')),rn.node,re.node,rp.node,el('p',{class:'account-help'},t('passwordHint')),el('button',{type:'submit',class:'primary',disabled:busy},t('register'))]);
 return el('div',{},[el('div',{class:'account-google'},[googleButton(),el('p',{class:'account-help'},googleReady?t('googleHint'):t('googleMissing'))]),el('div',{class:'account-auth-grid'},[signin,register])]);
}
function profilePanel() {
 const name=field(t('username'),'text','username',{required:true,minlength:3,maxlength:20,value:user.username,autocomplete:'nickname'}), bio=el('textarea',{name:'bio',maxlength:240,rows:4,placeholder:t('bio')},user.bio||'');
 const avatarFile=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp',name:'avatar'}), preview=avatarNode(user.avatar,user.username,true);
 avatarFile.onchange=()=>{const f=avatarFile.files&&avatarFile.files[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>140*1024){setNotice(t('avatarHint'),'bad');render();return;}const reader=new FileReader();reader.onload=()=>{preview.replaceChildren(el('img',{alt:user.username,src:String(reader.result)}));preview.dataset.pendingAvatar=String(reader.result);};reader.onerror=()=>{setNotice(t('avatarRead'),'bad');render();};reader.readAsDataURL(f);};
 const form=el('form',{class:'account-form profile-edit',onsubmit:async e=>{e.preventDefault();if(busy)return;const patch={username:name.input.value,bio:bio.value};if(preview.dataset.pendingAvatar)patch.avatar=preview.dataset.pendingAvatar;busy=true;setNotice(t('loading'));render();try{const d=await api('/api/profile','POST',patch);user=d.user;setNotice(t('saved'),'good');}catch(err){setNotice(err.message,'bad');}finally{busy=false;render();}}},[el('h3',{},t('edit')),el('div',{class:'account-edit-top'},[preview,el('div',{class:'account-field'},[el('span',{},t('avatar')),avatarFile,el('small',{class:'account-help'},t('avatarHint'))])]),name.node,el('label',{class:'account-field'},[el('span',{},t('bio')),bio]),el('button',{type:'submit',class:'primary',disabled:busy},t('save'))]);
 const card=el('section',{class:'account-profile-card'},[el('div',{class:'account-profile-head'},[avatarNode(user.avatar,user.username),el('div',{},[el('h3',{},user.username),el('p',{class:'account-muted'},t('signedIn')),el('p',{class:'account-id'},t('uid')+': '+user.id)])]),el('div',{class:'account-stats'},[stat(t('rating'),user.rating),stat(t('coins'),user.coins),stat(t('games'),user.gamesPlayed),stat(t('wins'),user.wins)]),user.bio?el('p',{class:'account-bio'},user.bio):null,el('p',{class:'account-note'},t('profileOnly')),el('p',{class:'account-help'},t('ratingNote')),el('button',{class:'ghost',onclick:async()=>{if(busy)return;busy=true;render();try{await api('/api/logout','POST',{});}catch(_){}finally{persistToken('');user=null;busy=false;setNotice(t('signedOutMsg'),'neutral');render();}}},t('signOut'))]);
 return el('div',{class:'account-profile-grid'},[card,form]);
}
function render() {
 const r=root();if(!r)return;r.replaceChildren();
 r.append(el('div',{class:'screen-head'},[el('div',{},[el('h2',{},t('title')),el('p',{class:'screen-intro'},t('intro'))]),el('span',{class:'status-pill '+(user?'good':'neutral')},user?t('signedIn'):t('signedOut'))]));
 const msg=messageNode();if(msg)r.append(msg);
 if(location.protocol==='file:'||apiState==='offline')r.append(el('div',{class:'account-server-warning',role:'status'},[el('strong',{},t('serverShort')),el('p',{},t('server'))]));
 r.append(user?profilePanel():el('div',{},[el('p',{class:'account-muted'},t('noProfile')),authPanel()]));
}
async function consumeOAuthTicket() {
 let u; try { u=new URL(location.href); } catch (_) { return; }
 const ticket=u.searchParams.get('oauth_ticket'), googleError=u.searchParams.get('google_error');
 if(!ticket&&!googleError)return;
 u.searchParams.delete('oauth_ticket');u.searchParams.delete('google_error');history.replaceState(null,'',u.pathname+(u.search?'?'+u.searchParams.toString():'')+u.hash);
 if(googleError){setNotice(t('googleFail'),'bad');return;}
 try{const d=await api('/api/oauth/google/exchange','POST',{ticket},false);persistToken(d.token);user=d.user;setNotice(t('loggedIn'),'good');loaded=false;}catch(err){setNotice(err.message||t('googleFail'),'bad');}
}
async function load() {
 if(loaded&&apiState!=='offline')return;loaded=true;
 if(location.protocol==='file:'){apiState='offline';render();return;}
 try{const status=await api('/api/oauth/google/status');googleReady=!!status.configured;}catch(_){googleReady=false;}
 if(token){try{const d=await api('/api/me');user=d.user;}catch(err){user=null;if(err.code==='UNAUTHENTICATED')persistToken('');}}
 render();
}
N.ui.screens.profile={show(){render();load();},render};
consumeOAuthTicket().then(()=>{if(root()&&!root().hidden)render();});
})();
