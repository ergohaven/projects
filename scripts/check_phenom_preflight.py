#!/usr/bin/env python3
"""Release-only metadata and packaged asset closure for Phenom."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,urljoin,unquote
import argparse,json,re
class Document(HTMLParser):
 def __init__(self):super().__init__();self.lang='';self.meta={};self.links=[];self.assets=[];self.schema=[];self.injson=False;self.jsontxt=''
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='html':self.lang=a.get('lang') or ''
  if tag=='meta':self.meta[a.get('property') or a.get('name')]=a.get('content')
  if tag=='link':
   self.links.append(a)
   if any(x in (a.get('rel') or '').split() for x in ['stylesheet','icon','apple-touch-icon']):self.assets.append(a.get('href') or a.get('data-href'))
  if tag=='script' and a.get('type')=='application/ld+json':self.injson=True;self.jsontxt=''
  for k in ['src','data-src','poster','data-poster','data-delivery-src','data-delivery-fallback','data-layout-src']:
   if a.get(k):self.assets.append(a[k])
  for k in ['srcset','data-delivery-srcset']:
   if a.get(k):self.assets.extend(x.strip().split()[0] for x in a[k].split(',') if x.strip())
 def handle_data(self,data):
  if self.injson:self.jsontxt+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.injson:self.schema.append(json.loads(self.jsontxt));self.injson=False

def audit(site):
 pages=sorted(site.rglob('phenom/index.html'));assert len(pages)==2,'Require both bilingual preview pages'
 result=[]
 for p in pages:
  text=p.read_text();d=Document();d.feed(text);lang='ru' if d.lang.startswith('ru') else 'en';origin='https://projects.eh.works' if lang=='ru' else 'https://projects.eh.industries';canonical=origin+'/phenom/'
  assert any(l.get('rel')=='canonical' and l.get('href')==canonical for l in d.links)
  alternates={l.get('hreflang'):l.get('href') for l in d.links if l.get('rel')=='alternate'}
  assert alternates=={'ru':'https://projects.eh.works/phenom/','en':'https://projects.eh.industries/phenom/','x-default':'https://projects.eh.industries/phenom/'},alternates
  assert d.meta.get('description') and d.meta.get('og:title') and d.meta.get('og:description')
  assert d.meta.get('og:url')==canonical
  assert d.meta.get('og:locale')==('ru_RU' if lang=='ru' else 'en_US')
  assert d.meta.get('og:image'),'Missing social preview image'
  assert d.meta.get('og:image:width')=='1200' and d.meta.get('og:image:height')=='630'
  assert d.meta.get('twitter:card')=='summary_large_image' and d.meta.get('twitter:image')==d.meta['og:image']
  assert any('icon' in (l.get('rel') or '').split() for l in d.links),'Missing favicon'
  assert any(l.get('rel')=='apple-touch-icon' for l in d.links)
  assert any(s.get('@type')=='Product' and s.get('image')==d.meta['og:image'] for s in d.schema)
  assert not re.search(r'livereload|browser-sync|/_p\d+/|/candidate/|127\.0\.0\.1:13\d\d|192\.168\.1\.220:13\d\d',text),'Development connection in HTML'
  queue=[u for u in d.assets if u]+[d.meta['og:image']];seen=set()
  while queue:
   raw=queue.pop();u=urlsplit(raw)
   if raw.startswith(('data:','#','blob:')):continue
   assert not u.netloc or u.hostname in ['projects.eh.works','projects.eh.industries','localhost'],f'External packaged resource: {raw}'
   key=unquote(u.path).lstrip('/')
   if key in seen:continue
   seen.add(key);f=site/key;assert f.is_file(),f'Missing packaged resource: {key}'
   if f.suffix=='.css':
    for link in re.findall(r'url\(\s*[\"\']?([^\"\')]+)',f.read_text()):queue.append(urljoin('/'+key,link.strip()))
   if f.suffix=='.js':assert not re.search(r'livereload|browser-sync|/_p\d+/|192\.168\.1\.220:1317',f.read_text()),f'Development connection in {key}'
  result.append({'lang':lang,'canonical':canonical,'socialImage':d.meta['og:image'],'packagedAssets':len(seen)})
 return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('site',type=Path);args=parser.parse_args();rows=audit(args.site.resolve());print(json.dumps(rows,ensure_ascii=False,indent=2))
