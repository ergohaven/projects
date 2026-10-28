#!/usr/bin/env python3
"""Product-scoped Phenom source and standalone-build contract checks."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import argparse,hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self):super().__init__();self.lang='';self.h1=0;self.layout=False;self.heading='';self.urls=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='html':self.lang=a.get('lang') or ''
  if tag=='h1':self.h1+=1
  if tag=='h2' and a.get('id')=='key-layout-title':self.layout=True
  if tag in ['script','link']:
   url=a.get('data-src') or a.get('src') or a.get('data-href') or a.get('href')
   if url and urlsplit(url).path.endswith(('.css','.js')):self.urls.append(url)
 def handle_endtag(self,tag):
  if tag=='h2':self.layout=False
 def handle_data(self,data):
  if self.layout:self.heading+=data

def source_checks():
 for lang in ['ru','en']:
  s=(ROOT/f'content/{lang}/phenom/index.md').read_text()
  assert re.search(r'^type: phenom$',s,re.M),f'{lang}: use isolated Phenom layout, not shared product templates'
 assert 'title: Choose your layout' in (ROOT/'content/en/phenom/index.md').read_text()
 for rel in ['layouts/phenom/baseof.html','layouts/phenom/single.html','layouts/partials/phenom/head.html','assets/js/phenom-cta.js','assets/js/phenom-motion-en.js','assets/js/phenom-motion-ru.js']:
  assert (ROOT/rel).is_file(),rel
 data=json.loads((ROOT/'data/phenom_photo_delivery.json').read_text());variants={v['path']:v for entry in data.values() for v in entry['variants']}
 for rel,v in variants.items():
  p=ROOT/'assets'/rel;assert p.is_file(),rel
  assert hashlib.sha256(p.read_bytes()).hexdigest()==v['sha256'],f'Approved encoded bytes changed: {rel}'
 print('PASS isolated RU/EN source +',len(variants),'exact approved photo encodings')

def build_checks(site):
 from check_html import check_page
 pages=sorted(site.rglob('phenom/index.html'));assert pages,'No built Phenom pages'
 for p in pages:
  text=p.read_text();page=Page();page.feed(text)
  domain='https://projects.eh.works/' if page.lang.startswith('ru') else 'https://projects.eh.industries/'
  structural=check_page(p,page.lang,domain,'phenom');assert not structural,'\n'.join(structural)
  assert page.h1==1,(str(p),'single h1')
  expected='Подберите подходящий формат' if page.lang.startswith('ru') else 'Choose your layout'
  assert ' '.join(page.heading.split())==expected,(str(p),page.heading)
  assert not re.search(r'/_p\d+/|/candidate/|192\.168\.1\.220:13\d\d|127\.0\.0\.1:13\d\d',text),f'Private snapshot URL in {p}'
  scripts=[]
  for u in page.urls:
   url=urlsplit(u)
   if url.scheme and url.netloc and not url.netloc.startswith('localhost'):continue
   asset=site/url.path.lstrip('/');assert asset.is_file(),f'Missing packaged resource {u}'
   if asset.suffix=='.js':scripts.append(asset)
  assert any('phenom-cta' in s.name for s in scripts),'Missing CTA controller'
  motion='phenom-motion-ru' if page.lang.startswith('ru') else 'phenom-motion-en'
  assert any(motion in s.name for s in scripts),'Wrong locale motion controller'
  for s in scripts:
   js=s.read_text();assert not re.search(r'/_p\d+/|192\.168\.1\.220:1317|127\.0\.0\.1:13\d\d',js),f'Runtime depends on preview server: {s}'
  print('PASS standalone resource closure',p.relative_to(site),len(page.urls),'CSS/JS references')

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path);parser.add_argument('--active-html',type=Path,nargs=2,metavar=('SOURCE','TARGET'));args=parser.parse_args()
 if args.active_html:
  src,dst=args.active_html;active=re.sub(r'<noscript\b[^>]*>.*?</noscript>','',src.read_text(),flags=re.S);active=re.sub(r'(<script\b[^>]*>).*?(</script>)',r'\1\2',active,flags=re.S);dst.write_text(active);return
 source_checks()
 if args.site:build_checks(args.site.resolve())
if __name__=='__main__':main()
