"""Shared interpretation and provider evidence for supported facility preferences."""
import re
import unicodedata

FACILITIES = {
    'cafe': {'pattern':r'カフェ|喫茶|コーヒー|cafe|coffee','query':'カフェ','type':'cafe','types':('cafe','coffee_shop'),'label':'カフェ'},
    'toilet': {'pattern':r'トイレ|お手洗い|toilet|restroom|洗手间','query':'公衆トイレ','type':None,'types':('public_bathroom',),'label':'トイレ'},
    'supermarket': {'pattern':r'スーパー(?:マーケット)?|\bsupermarkets?\b|\bgrocery\b|超市','query':'スーパーマーケット','type':'supermarket',
                    'types':('supermarket','grocery_store','discount_supermarket','hypermarket'),'label':'スーパー'},
}


def requested_facilities(text):
    text=unicodedata.normalize('NFKC',text)
    return tuple(kind for kind,spec in FACILITIES.items() if re.search(spec['pattern'],text,re.IGNORECASE))


def verified_facility(stop, kind):
    if not stop.place_verified:
        return False
    if kind=='toilet':
        return stop.restroom is True
    if kind=='supermarket' and 'convenience_store' in stop.place_types and 'supermarket' not in stop.place_types:
        return False
    return any(value in stop.place_types for value in FACILITIES[kind]['types'])


def generic_facility_name(name):
    return name.strip().lower() in {'カフェ','喫茶店','トイレ','公衆トイレ','スーパー','スーパーマーケット','supermarket','cafe','restroom'}
