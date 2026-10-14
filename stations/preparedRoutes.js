// Předpřipravené skutečné kolejové trasy z OSM. Zjednodušení zachovává tvar kolejí s tolerancí přibližně 1–2 m.
// Data jsou zabalená do Base64 polyline, aby byla malá a nemusela se stahovat z Overpass.
(function () {
  "use strict";
  function decodePolylineBase64(base64) {
    const encoded = atob(base64);
    const coords = [];
    let index = 0, lat = 0, lon = 0;
    while (index < encoded.length) {
      let result = 0, shift = 0, b;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      result = 0; shift = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lon += (result & 1) ? ~(result >> 1) : (result >> 1);
      coords.push([lat / 1e5, lon / 1e5]);
    }
    return coords;
  }
  window.STATION_PREPARED_ROUTES = {
    "plzen:rokycany": decodePolylineBase64("aWlybkhtbnVwQV13RGNAYURtRHdReUBzQ3dCb0ZvQmVHX0R9THNAY0NvQXtDfUFpQ3lAY0F3Q3dDaUVlRnNDe0N1QGdBa0BlQX1AYUNpQHVCdUNfUGVBYUZ9QHlDc0FlRGVDb0VvQ19Fa2dAeW1AZ0VxRmFDc0RfQ2FFd0JpRXlCa0ZlQ3FId0JnSG1Ce0hfQnlId0F1Sn1Ac0pjQGFKT31JQ3VJSG1LUHNHXmNLblJ1cUR6Q21vQGJAdUdkQG1GakF7SWxBY0hgQmlIaEJxR3pBZ0ViQmlFdktzVXhDYUhiQmdFcEpzV3hFfU5wQndGZEFjRGxBZUZ4QG9GXn1EfEB5T35AeUpgQ19eWnFHRmdFR2NHX0FfUU9nRkBnR1B7RXBAeUhyS2tiQWRAaUZScUVEe0ZNc0dZY0VzQXFOUXFDS3lDQ19EQmdESl9ETm9DZkB5RXJAbUVwQH1DbEF9RGhCcUV6SGdQalVhZ0BmQXVDbkFjRX5AYUV0QGlFaEBxRWJAfUZSaUdAaUV9QH1uQFFnRVVjUD95RE53RGJAfUVqRGFU"),
    "plzen:prestice": decodePolylineBase64("aWlybkhtbnVwQXxAYktwQGBFZ0BvQmNCbUZiQ2xKbEFgR29CZUlfQl9GakBqQm5AdkN4RWJYUmxCRnpBP3JGQmhCWGZDUn5AZEB0QV52QGpAekBkQGZAckBoQHRAXHhAUHZARHRAQ3xAUXBAV25gQGFWZEJ9QH5HdUNqQmVBakFlQXRBaUJuQG9BbkJnRXhBfUJsQG9AfEB3QHhAZ0BqQWVAZkFXcEFLcklbdEdTeEBAekBIeEBQfEBYekBkQHpAakB+QHxAbkB4QG5AYkFsQGxBckBuQmhAdEJoRXpUUnxBTmpCRmRFSX5DXWpHU3BDVWxCV3xBZUB0Ql9DYEljQHxCU25CTXJCRXZCQmJDVG5JQXBCSWpDZUB8RXlCfk5bdkRFcEJAdEJ4QGhQSGZDP3JCSX5Ea0B6Skt0Q1ViUUB2REpsQ1hqQ25AfkNuQHRCeEF+Q3xJdlByQGxBdkB+QHRBbkF4QWBBYkFgQGBCXGxHZEBwT2hAdEJUbGVAYEJ2QUxiQVBkQnJAfEFkQXpEfkRmVWhWfkFwQXBCYkF0QWBAekFSaEFGakFDakFLZEFVfklnQ2RBVWJCS3pAQnhATHRBZEB2QXpAZEFiQWREdkRqQX5AaEFsQH5BakB8Wm5KdEJ6QGZDYkJufEBscUB6Q3hDYGBAbmJAbEFsQXJBYkF0QGJAbEFqQHZBYkBqQVR4QlBwSUp4QURsQVByQWRAZkFuQHpAdEBuQ3pDYkBwQGRBckJgQXxBZkJqRHBAYkFuQHZAfEFyQX5NcEpsQmBCckFsQHhAUHRARmBBP3xFXXRAP2BBSHpATnxAWG5AWn5AbEB8QHZAdkB+QGxAfEB4UWxaakFmQnhAfkBmQGJAeEBmQGhBYEBuQEpyQERqQEFuQEd0QE9wQFluQF1sQGdAakBtQGhAdUBiQXVCdEBvQ2hBe0ZuQGdDekBfQ35AZUJ6QGVBaEBlQHxAbUBgQWVAakFZdkBJckBDekBCaEBGekBSbENkQWRoQWJmQGREbEJgQm5BfFB8T2xBfkBmQWpAZkFgQGRBVmhBTnBAQnpAP2hBR3ZATWJBVXhBa0B2QXtAakFjQWhBbUFwQGFBdEB1QWRNe1ZoQW1CaEFfQnBCc0J+QWtBcEJhQWBBXWxBV2xDV2p2QH1AYkNHckJRfEJZeEFZfkFfQHhCb0B6RH1BdkR1QmpoQH1dZEF9QGpAbUBiQXlBckB3QXJAbUJiQGVCYkBnQ1h5Q3ZBeVRWY0NiQF9DekB5Q35AcUJmQWVCdEF1QXJBYUFqX0BxVXZBdUBwQndAZkZzQXhSdUR0Qm9AcFRpRQ==")
  };
  window.STATION_BUNDLED_ROUTE_KEYS = new Set(Object.keys(window.STATION_PREPARED_ROUTES));
})();