mesh化
curl -X POST "http://localhost:8000/visualize-mesh" -F "image=@image/test4_yoko.jpeg" -F "consent=true" | jq -r '.mesh_image' | sed 's/data:image\/png;base64,//' | base64 -d > mesh_image/test4_yoko.png.png

mesh編集
curl -X POST "http://localhost:8000/mesh/deform" -F "image=@image/test4_yoko.jpeg" -F "prompt=鼻尖 +1.0mm" -F "consent=true" | jq -r '.mesh_image' | sed 's/data:image\/png;base64,//' | base64 -d > mesh_deformed_orientation_aware.png


curl -X POST "http://localhost:8000/mesh/deform" \
  -F "image=@image/test4_yoko.jpeg" -F "prompt=鼻尖 +0.8mm" -F "consent=true" \
  | tee resp_deform.json >/dev/null && \
jq -r '.mesh_image' resp_deform.json | sed 's#data:image/png;base64,##' | base64 -d > mesh_deformed.png && \
jq '.mesh_info' resp_deform.json

beforeafterを重ねる方法
curl -s -X POST "http://localhost:8000/mesh/overlay" \
  -F "source_image=@image/before.jpeg" -F "target_image=@image/after.jpeg" \
  -F "consent=true" \
  | jq -r '.mesh_image' | sed 's#data:image/png;base64,##' | base64 -d > mesh_overlay_BtoA_6.png

beforeで作ったmeshをafterの写真に被せられる
