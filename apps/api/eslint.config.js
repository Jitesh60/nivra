import base from '@sajha/eslint-config/base';

export default [...base, { ignores: ['src/generated/**', 'dist/**'] }];
