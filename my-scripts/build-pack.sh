#!/bin/bash
# kimi-webbridge 构建 + 打包脚本
# 修改代码后重新编译 extension + daemon，可选打 zip 包
# 用法: ./my-scripts/build-pack.sh [--pack]
# V2-20260714

set -e
cd "$(dirname "$0")/.."

echo "==> 1/3 npm install..."
npm install 2>&1 | tail -1

echo ""
echo "==> 2/3 npm run build（extension + daemon）"
npm run build 2>&1

if [ "$1" = "--pack" ]; then
  echo ""
  echo "==> 3/3 packaging..."
  mkdir -p dist
  ZIP="dist/kimi-webbridge-$(date +%Y%m%d-%H%M%S).zip"

  # extension/（排除 node_modules）
  (cd extension && zip -r "../$ZIP" . -x "node_modules/*" > /dev/null)

  # daemon/dist/（编译产物）
  (cd daemon && zip -r "../$ZIP" dist/ > /dev/null)

  # daemon/package.json（用于 npm start）
  (cd daemon && zip "../$ZIP" package.json > /dev/null)

  # 根 package.json（workspace 定义）
  zip "$ZIP" package.json > /dev/null

  echo "    done: $ZIP ($(du -h "$ZIP" | cut -f1))"
fi

echo ""
echo "✅ build complete"
