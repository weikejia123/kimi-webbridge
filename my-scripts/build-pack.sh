#!/bin/bash
# kimi-webbridge 构建 + 打包脚本
# 修改代码后重新编译并打 zip 包，用于 Chrome 加载已解压的扩展
# 用法: ./my-scripts/build-pack.sh [--pack]

set -e
cd "$(dirname "$0")/.."

echo "==> npm install（如依赖有变动）"
npm install 2>&1 | tail -2

echo ""
echo "==> npm run build"
npm run build 2>&1

# 可选打包
if [ "$1" = "--pack" ]; then
  echo ""
  echo "==> packaging extension..."
  mkdir -p dist
  ZIP="dist/kimi-webbridge-$(date +%Y%m%d-%H%M%S).zip"
  cd extension
  zip -r "../$ZIP" . -x "node_modules/*" > /dev/null
  cd ..
  echo "    done: $ZIP ($(du -h "$ZIP" | cut -f1))"
fi

echo ""
echo "✅ build complete"
