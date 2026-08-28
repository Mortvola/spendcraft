import Http from "@mortvola/http";
import { ApiResponse, TaxCategoriesProps } from "../../common/ResponseTypes";
import { observable } from "mobx";

interface TaxCategory {
  type: string,
  description: string,
}

class TaxCategories {
  @observable
  accessor taxCategories: TaxCategory[] = []

  async load() {
    const response = await Http.get<ApiResponse<TaxCategoriesProps>>('/api/v1/taxes/categories')

    if (response.ok) {
      const { data } = await response.body()

      if (data) {
        this.taxCategories = data.taxCategories.map((taxcat) => ({
          type: taxcat.type,
          description: taxcat.description,
        }))
      }
    }
  }
}

export default TaxCategories;
