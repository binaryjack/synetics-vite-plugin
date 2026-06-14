const { transformWithEsbuild } = require('vite');

const tsCode = `import { $REGISTRY, t_element } from '@synetics/synetics.dev';
import { cn } from '@synetics/design-tokens';
import type { IAvatarProps } from './avatar.type';

const getInitials = (name) => {
  return name.substring(0, 2).toUpperCase();
};

export function Avatar({
  size = 'md',
  src,
  alt,
  name,
  status,
  bg,
  className,
  ...rest
}: IAvatarProps): HTMLElement {
  return $REGISTRY.execute('component:Avatar', null, () => {
    return t_element('div', {}, []);
  });
}
`;

transformWithEsbuild(tsCode, 'avatar.syn', {
  loader: 'ts',
  target: 'esnext',
  sourcemap: true,
}).then(r => console.log(r.code)).catch(console.error);
