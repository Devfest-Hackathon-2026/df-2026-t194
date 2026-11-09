from app.models import LatLng

def encode_path(path: list[LatLng]) -> str:
    output = []
    previous_lat = previous_lng = 0
    for point in path:
        lat, lng = round(point.lat * 100000), round(point.lng * 100000)
        for delta in (lat - previous_lat, lng - previous_lng):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 32:
                output.append(chr((32 | (value & 31)) + 63))
                value >>= 5
            output.append(chr(value + 63))
        previous_lat, previous_lng = lat, lng
    return ''.join(output)

