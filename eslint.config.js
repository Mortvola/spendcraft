import tseslint from 'typescript-eslint'
import { GLOBAL_IGNORE_LIST } from '@adonisjs/eslint-config'


function configApp(...configBlocksToMerge) {
    return tseslint.config(
        { ignores: GLOBAL_IGNORE_LIST },
    )
}

export default configApp()
