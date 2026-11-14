/**
 * Runs before paint (inline in <head>): applies a saved light/dark choice from the theme toggle.
 * The TV (/tv) is always dark (the slides are dark-first), whatever the browser saved.
 */
export const THEME_SCRIPT = `try{var d=document.documentElement,t=null;try{t=localStorage.getItem("theme")}catch(e){}if(location.pathname==="/tv"||location.pathname.indexOf("/tv/")===0)t="dark";if(t==="light"||t==="dark")d.setAttribute("data-theme",t)}catch(e){}`;
