var n=["hp","sp","recall","scrap","ore","crystal","wood","chest","box","coin","gem","pickaxe","axe","token","fish","hammer"],e=!1;function o(){if(e||typeof document>"u")return;e=!0;let r=document.createElement("style");r.textContent=`.wi-art{display:inline-block!important;flex:none;width:var(--wi)!important;height:var(--wi)!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;background-image:url("/images/items/items.webp?v=1")!important;background-repeat:no-repeat!important;background-size:400% 400%!important;vertical-align:middle;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));pointer-events:none}
.wr-fart .wi-art{filter:drop-shadow(0 6px 12px rgba(0,0,0,.45)) drop-shadow(0 0 10px var(--ic,transparent))}
.wr-fart.sup-hp{--ic:rgba(255,77,109,.45)}.wr-fart.sup-sp{--ic:rgba(56,184,255,.45)}.wr-fart.sup-recall{--ic:rgba(120,140,255,.45)}.wr-fart.sup-scrap{--ic:rgba(120,200,255,.3)}
.wr-res .wi-art{margin:-3px 2px 0 0}
.wl-mats .wi-art{margin-left:-6px}.wl-chip .wi-art{margin-left:-5px}
.wl-recipes li>.wi-art{margin-right:-2px}.wl-recipes li>div{flex:1;min-width:0}
.wl-mastery b .wi-art{margin:-4px 4px 0 0}
.wq-chest.done .wi-art{filter:grayscale(.7) brightness(.75)}`,document.head.appendChild(r)}function p(r,i=24,a=""){let t=n.indexOf(r);return t<0?"":(o(),`<i class="wi-art${a?" "+a:""}" style="--wi:${i}px;background-position:${t%4*100/3}% ${Math.floor(t/4)*100/3}%" aria-hidden="true"></i>`)}export{p as a};
